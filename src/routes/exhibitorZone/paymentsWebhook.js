const express = require("express");
const pool = require("../../db/pool");
const asyncHandler = require("../../middleware/asyncHandler");
const { decrypt } = require("../../utils/crypto");
const { verifyWebhookSignature } = require("../../utils/razorpay");
const { markTransactionSuccess, markTransactionFailed } = require("../../utils/paymentTransactions");

const router = express.Router();

// Razorpay calls this server-to-server with no session cookie, so signature
// verification — not requireAuth — is what proves the request is genuine.
// This router is mounted ahead of the authenticated payments router at the
// same "/payments" prefix (see routes/exhibitorZone/index.js): only this one
// path is public, every other /payments/* route still needs a session.
//
// This is the reliable confirmation path — it fires even if the exhibitor
// closes the browser tab right after paying, before POST /payments/verify's
// client-side callback gets a chance to run. Configure it in the Razorpay
// Dashboard as https://<api-host>/api/exhibitor-zone/payments/webhook,
// subscribed to at least "payment.captured" and "payment.failed", and put
// its signing secret in RAZORPAY_WEBHOOK_SECRET.
router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];

    if (!verifyWebhookSignature(req.rawBody, signature)) {
      console.warn("Razorpay webhook: signature verification failed.");
      return res.status(400).json({ message: "Invalid signature." });
    }

    const event = req.body || {};
    const entity = event.payload && event.payload.payment && event.payload.payment.entity;
    if (!entity) return res.json({ message: "Ignored — no payment entity in payload." });

    // The Razorpay order was created with notes.orderId set to our internal
    // orders.id (see payments.js POST /checkout/:orderId), so this is a
    // direct lookup — no need to decrypt every stored gateway order id to
    // find a match.
    const internalOrderId = entity.notes && entity.notes.orderId;
    if (!internalOrderId) return res.json({ message: "Ignored — no orderId in payment notes." });

    const [txRows] = await pool.query(
      "SELECT * FROM payment_transactions WHERE order_id = ? ORDER BY created_at DESC LIMIT 1",
      [internalOrderId]
    );
    const transaction = txRows[0];
    if (!transaction) return res.json({ message: "Ignored — no matching transaction on file." });

    // Defense in depth beyond trusting notes.orderId alone: confirm this
    // transaction's own Razorpay order id matches before crediting anything.
    let matches = false;
    try {
      matches = decrypt(transaction.gateway_order_id_enc) === entity.order_id;
    } catch {
      matches = false;
    }
    if (!matches) return res.json({ message: "Ignored — transaction/order id mismatch." });

    if (event.event === "payment.captured" || event.event === "order.paid") {
      await markTransactionSuccess(pool, {
        transaction,
        gatewayPaymentId: entity.id,
        gatewaySignature: null,
        gatewayResponse: event
      });
    } else if (event.event === "payment.failed") {
      await markTransactionFailed(pool, { transaction, gatewayStatus: entity.status, gatewayResponse: event });
    }

    res.json({ message: "ok" });
  })
);

module.exports = router;
