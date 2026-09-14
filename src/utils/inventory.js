// Shared inventory bookkeeping for service_items, called from both payment
// flows (Razorpay success + admin manual "Mark Paid") and order cancellation
// — kept in one place so reserved/sold never drift out of sync depending on
// which path an order took.
//
// service_items tracks three counters: inventory_total (NULL = unlimited),
// inventory_reserved (checked out, not yet paid), inventory_sold (paid).
// Availability for a new add-to-cart is always
// inventory_total - inventory_reserved - inventory_sold (see cart.js).

// Called once, the moment an order first reaches payment_status = 'paid' —
// moves each line item's quantity from "reserved" to "sold" so the
// reservation becomes permanent instead of sitting in limbo forever.
async function convertReservedToSold(connection, orderId) {
  const [items] = await connection.query("SELECT service_item_id, quantity FROM order_items WHERE order_id = ?", [orderId]);
  for (const item of items) {
    await connection.query(
      "UPDATE service_items SET inventory_reserved = GREATEST(0, inventory_reserved - ?), inventory_sold = inventory_sold + ? WHERE id = ?",
      [item.quantity, item.quantity, item.service_item_id]
    );
  }
}

// Called when an order is cancelled — releases its stock back to available.
// `wasPaid` says which bucket to release from: an unpaid/reserved-only order
// releases from inventory_reserved, one that had already been marked paid
// (and therefore already converted via convertReservedToSold) releases from
// inventory_sold instead.
async function releaseOrderInventory(connection, orderId, wasPaid) {
  const [items] = await connection.query("SELECT service_item_id, quantity FROM order_items WHERE order_id = ?", [orderId]);
  const column = wasPaid ? "inventory_sold" : "inventory_reserved";
  for (const item of items) {
    await connection.query(`UPDATE service_items SET ${column} = GREATEST(0, ${column} - ?) WHERE id = ?`, [
      item.quantity,
      item.service_item_id
    ]);
  }
}

module.exports = { convertReservedToSold, releaseOrderInventory };
