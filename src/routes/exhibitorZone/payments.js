const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const pool = require("../../db/pool");
const asyncHandler = require("../../middleware/asyncHandler");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const requireEventContext = require("../../middleware/requireEventContext");
const requireCompanyAccess = require("../../middleware/requireCompanyAccess");
const validate = require("../../middleware/validate");
const { ApiError } = require("../../middleware/errorHandler");
const { resolveOwnProfileId } = require("../../utils/exhibitorProfile");
const { encrypt } = require("../../utils/crypto");
const { getRazorpayClient, isRazorpayConfigured, verifyPaymentSignature } = require("../../utils/razorpay");
const { markTransactionSuccess, markTransactionFailed } = require("../../utils/paymentTransactions");
const { requireModule } = require("../../middleware/requireModule");

const router = express.Router();
const ADMIN_ROLES = ["super_admin", "organiser", "finance", "operations", "sales"];

router.use(requireAuth, requireEventContext);

// Razorpay wants amounts as an integer number of paise.
function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

async function loadOwnOrder(req, orderId) {
  const profileId = await resolveOwnProfileId(pool, req);
  const [orderRows] = await pool.query(
    `SELECT o.*, c.display_name AS company_name FROM orders o
     JOIN exhibitor_event_profiles eep ON eep.id = o.exhibitor_profile_id
     JOIN companies c ON c.id = eep.company_id
     WHERE o.id = ? AND o.event_id = ? AND o.exhibitor_profile_id = ? LIMIT 1`,
    [orderId, req.user.eventId, profileId]
  );
  if (orderRows.length === 0) throw new ApiError(404, "Order not found.");
  return orderRows[0];
}

// POST /payments/checkout/:orderId — creates a fresh Razorpay order for the
// order's current amount due and logs an 'initiated' payment_transactions
// row, returning everything the frontend needs to open Razorpay Checkout.js.
router.post(
  "/checkout/:orderId",
  asyncHandler(async (req, res) => {
    if (!isRazorpayConfigured()) {
      throw new ApiError(503, "Online payments are not set up yet. Please contact the organiser.");
    }

    const order = await loadOwnOrder(req, req.params.orderId);
    if (order.payment_status === "paid") throw new ApiError(400, "This order is already fully paid.");
    if (order.payment_status === "refunded") throw new ApiError(400, "This order has been refunded.");
    if (order.status === "cancelled") throw new ApiError(400, "This order has been cancelled.");

    const [invoiceRows] = await pool.query("SELECT * FROM invoices WHERE order_id = ? LIMIT 1", [order.id]);
    const invoice = invoiceRows[0];
    if (!invoice) throw new ApiError(404, "Invoice not found for this order.");

    const amountDue = Number(invoice.amount_due);
    if (amountDue <= 0) throw new ApiError(400, "There is nothing due on this order.");

    const razorpay = getRazorpayClient();
    const razorpayOrder = await razorpay.orders.create({
      amount: toPaise(amountDue),
      currency: order.currency || "INR",
      receipt: `${order.order_number}-${Date.now().toString(36)}`,
      notes: { orderId: String(order.id), eventId: String(order.event_id), orderNumber: order.order_number }
    });

    const [result] = await pool.query(
      `INSERT INTO payment_transactions
        (uuid, event_id, invoice_id, order_id, gateway, gateway_order_id_enc, amount, currency,
         status, gateway_status, gateway_response, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'razorpay', ?, ?, ?, 'initiated', ?, ?, NOW(), NOW())`,
      [
        crypto.randomUUID(),
        order.event_id,
        invoice.id,
        order.id,
        encrypt(razorpayOrder.id),
        amountDue,
        razorpayOrder.currency,
        razorpayOrder.status,
        JSON.stringify(razorpayOrder)
      ]
    );

    res.status(201).json({
      transactionId: result.insertId,
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      orderId: order.id,
      orderNumber: order.order_number,
      companyName: order.company_name,
      name: req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ""}`.trim() : order.company_name,
      email: req.user.email
    });
  })
);

const verifySchema = z.object({
  transactionId: z.coerce.number().int().positive(),
  razorpayOrderId: z.string().trim().min(1),
  razorpayPaymentId: z.string().trim().min(1),
  razorpaySignature: z.string().trim().min(1)
});

// POST /payments/verify — called from the browser's Razorpay Checkout.js
// success handler. Confirms the HMAC signature Razorpay returned to the
// client can't be trusted blindly (it's client-supplied), verifies it
// server-side against the key secret, then credits the order/invoice via the
// same helper the webhook uses — so whichever of the two arrives first wins
// and the other is a safe no-op.
router.post(
  "/verify",
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const { transactionId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const profileId = await resolveOwnProfileId(pool, req);
    const [txRows] = await pool.query(
      `SELECT pt.* FROM payment_transactions pt
       JOIN orders o ON o.id = pt.order_id
       WHERE pt.id = ? AND pt.event_id = ? AND o.exhibitor_profile_id = ? LIMIT 1`,
      [transactionId, req.user.eventId, profileId]
    );
    const transaction = txRows[0];
    if (!transaction) throw new ApiError(404, "Payment transaction not found.");

    const validSignature = verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!validSignature) {
      await markTransactionFailed(pool, {
        transaction,
        gatewayStatus: "signature_mismatch",
        gatewayResponse: { razorpayOrderId, razorpayPaymentId }
      });
      throw new ApiError(400, "Payment verification failed. If money was deducted, it will be refunded automatically.");
    }

    const result = await markTransactionSuccess(pool, {
      transaction,
      gatewayPaymentId: razorpayPaymentId,
      gatewaySignature: razorpaySignature,
      gatewayResponse: { razorpayOrderId, razorpayPaymentId },
      userId: req.user.id
    });

    res.json({ message: "Payment successful.", paymentStatus: result.paymentStatus || "paid", orderId: transaction.order_id });
  })
);

// GET /payments/config — lets the frontend know whether online payments are
// live yet, without exposing the secret. Safe to call before an order exists.
router.get(
  "/config",
  asyncHandler(async (req, res) => {
    res.json({ configured: isRazorpayConfigured(), keyId: isRazorpayConfigured() ? process.env.RAZORPAY_KEY_ID : null });
  })
);

// GET /payments/orders/:orderId/transactions — payment attempt history for an
// order (own order for exhibitors, any order in-event for finance/admin).
router.get(
  "/orders/:orderId/transactions",
  requireCompanyAccess(async (req) => {
    const [rows] = await pool.query(
      `SELECT eep.company_id FROM orders o JOIN exhibitor_event_profiles eep ON eep.id = o.exhibitor_profile_id WHERE o.id = ?`,
      [req.params.orderId]
    );
    return rows[0] ? rows[0].company_id : null;
  }),
  requireModule("payments"),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT id, gateway, amount, currency, status, gateway_status, processed_at, created_at
       FROM payment_transactions WHERE order_id = ? AND event_id = ? ORDER BY created_at DESC`,
      [req.params.orderId, req.user.eventId]
    );
    res.json({ transactions: rows });
  })
);

// GET /payments/mine — the calling exhibitor's own payment history across
// every one of their orders, newest first. Powers the exhibitor-side
// "Payment History" page.
router.get(
  "/mine",
  asyncHandler(async (req, res) => {
    const profileId = await resolveOwnProfileId(pool, req);
    const [rows] = await pool.query(
      `SELECT pt.id, pt.order_id, o.order_number, pt.gateway, pt.amount, pt.currency, pt.status,
              pt.gateway_status, pt.payment_method, pt.processed_at, pt.created_at
       FROM payment_transactions pt
       JOIN orders o ON o.id = pt.order_id
       WHERE pt.event_id = ? AND o.exhibitor_profile_id = ?
       ORDER BY pt.created_at DESC`,
      [req.user.eventId, profileId]
    );
    res.json({ transactions: rows });
  })
);

// GET /payments/admin — every payment transaction in the active event, across
// every exhibitor, for finance/organiser reconciliation. Powers the admin
// "Payments" log page.
router.get(
  "/admin",
  requireRole(...ADMIN_ROLES),
  requireModule("payments"),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT pt.id, pt.order_id, o.order_number, c.display_name AS company_name, pt.gateway, pt.amount,
              pt.currency, pt.status, pt.gateway_status, pt.payment_method, pt.processed_at, pt.created_at
       FROM payment_transactions pt
       JOIN orders o ON o.id = pt.order_id
       JOIN exhibitor_event_profiles eep ON eep.id = o.exhibitor_profile_id
       JOIN companies c ON c.id = eep.company_id
       WHERE pt.event_id = ?
       ORDER BY pt.created_at DESC`,
      [req.user.eventId]
    );
    res.json({ transactions: rows });
  })
);

module.exports = router;
