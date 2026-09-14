const { encrypt } = require("./crypto");
const { notifyUser, notifyAdmins } = require("./notify");
const { convertReservedToSold } = require("./inventory");

const INVOICE_STATUS_MAP = { unpaid: "sent", partially_paid: "partially_paid", paid: "paid", refunded: "void" };

// Applies a successful gateway payment to its transaction/order/invoice, then
// notifies the exhibitor's users + event admins. Idempotent: if the
// transaction is already 'success' (e.g. both the browser's checkout handler
// and the async webhook fire for the same payment), it's a no-op — this is
// the single place both callers route through so a payment is only ever
// credited once.
async function markTransactionSuccess(pool, { transaction, gatewayPaymentId, gatewaySignature, gatewayResponse, userId = null }) {
  if (transaction.status === "success") return { alreadyProcessed: true };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Re-select under the transaction and bail out if another request already
    // flipped this row to 'success' between our caller's read and now.
    const [rows] = await connection.query("SELECT * FROM payment_transactions WHERE id = ? FOR UPDATE", [transaction.id]);
    const current = rows[0];
    if (!current || current.status === "success") {
      await connection.commit();
      return { alreadyProcessed: true };
    }

    await connection.query(
      `UPDATE payment_transactions
       SET status = 'success', gateway_payment_id_enc = ?, gateway_signature_enc = ?, gateway_status = 'captured',
           gateway_response = ?, processed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [encrypt(gatewayPaymentId), gatewaySignature ? encrypt(gatewaySignature) : null, JSON.stringify(gatewayResponse || {}), current.id]
    );

    const [orderRows] = await connection.query(
      `SELECT o.*, c.display_name AS company_name FROM orders o
       JOIN exhibitor_event_profiles eep ON eep.id = o.exhibitor_profile_id
       JOIN companies c ON c.id = eep.company_id WHERE o.id = ? LIMIT 1`,
      [current.order_id]
    );
    const order = orderRows[0];

    const [invoiceRows] = await connection.query("SELECT * FROM invoices WHERE id = ? LIMIT 1", [current.invoice_id]);
    const invoice = invoiceRows[0];

    const newAmountPaid = Math.min(Number(order.grand_total), Number(invoice.amount_paid) + Number(current.amount));
    const newAmountDue = Math.max(0, Number(order.grand_total) - newAmountPaid);
    const paymentStatus = newAmountDue <= 0.005 ? "paid" : "partially_paid";
    const orderStatus = paymentStatus === "paid" && order.status === "pending" ? "confirmed" : order.status;

    // Only the transition INTO fully paid converts stock — a second
    // successful transaction on an order that was already paid (shouldn't
    // normally happen, but the idempotency guard above only covers the
    // transaction row, not the order) must not double-convert.
    if (paymentStatus === "paid" && order.payment_status !== "paid") {
      await convertReservedToSold(connection, order.id);
    }

    await connection.query("UPDATE orders SET payment_status = ?, status = ?, updated_at = NOW() WHERE id = ?", [
      paymentStatus,
      orderStatus,
      order.id
    ]);
    await connection.query(
      `UPDATE invoices SET invoice_status = ?, amount_paid = ?, amount_due = ?, paid_at = ?, updated_at = NOW() WHERE id = ?`,
      [INVOICE_STATUS_MAP[paymentStatus], newAmountPaid, newAmountDue, paymentStatus === "paid" ? new Date() : invoice.paid_at, invoice.id]
    );
    await connection.query(
      "INSERT INTO audit_logs (event_id, user_id, action, entity_type, entity_id, new_value, created_at) VALUES (?, ?, 'order.payment_received', 'order', ?, ?, NOW())",
      [order.event_id, userId, order.id, JSON.stringify({ paymentStatus, amountPaid: newAmountPaid, transactionId: current.id })]
    );

    await connection.commit();

    const [companyUsers] = await pool.query(
      "SELECT DISTINCT user_id FROM user_event_roles WHERE company_id = (SELECT company_id FROM exhibitor_event_profiles WHERE id = ?) AND event_id = ?",
      [order.exhibitor_profile_id, order.event_id]
    );
    await Promise.all(
      companyUsers.map((u) =>
        notifyUser(pool, {
          userId: u.user_id,
          title: "Payment received",
          message: `Your payment of ₹${Number(current.amount).toFixed(2)} for order ${order.order_number} was successful. Order is now ${paymentStatus.replace("_", " ")}.`,
          type: "success"
        })
      )
    );
    notifyAdmins(pool, order.event_id, {
      title: "Payment received",
      message: `${order.company_name} paid ₹${Number(current.amount).toFixed(2)} for order ${order.order_number}.`,
      type: "success"
    }).catch((err) => console.error("Failed to notify admins of payment:", err));

    return { alreadyProcessed: false, paymentStatus, order };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function markTransactionFailed(pool, { transaction, gatewayResponse, gatewayStatus }) {
  if (transaction.status === "success" || transaction.status === "failed") return;
  await pool.query(
    `UPDATE payment_transactions SET status = 'failed', gateway_status = ?, gateway_response = ?, processed_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [gatewayStatus || "failed", JSON.stringify(gatewayResponse || {}), transaction.id]
  );
}

module.exports = { markTransactionSuccess, markTransactionFailed };
