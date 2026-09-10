const crypto = require("crypto");
const Razorpay = require("razorpay");

// Lazily constructed so the process can boot (and every other route can keep
// working) even before real keys are dropped into .env — only routes that
// actually need Razorpay throw, and only when called.
let client = null;

function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getRazorpayClient() {
  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env.");
  }
  if (!client) {
    client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  }
  return client;
}

function safeEqualHex(expectedHex, actualHex) {
  if (typeof actualHex !== "string" || !actualHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

// Verifies the razorpay_signature returned to the browser's checkout success
// handler: HMAC-SHA256("<razorpay_order_id>|<razorpay_payment_id>", key_secret).
// See https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/build-integration/#step-5-verify-payment-signature
function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  return safeEqualHex(expected, razorpaySignature);
}

// Verifies an incoming webhook call: HMAC-SHA256(rawRequestBody, webhookSecret)
// must match the X-Razorpay-Signature header. Requires the *raw* body bytes —
// see server.js's express.json({ verify }) which stashes req.rawBody for this.
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signatureHeader);
}

module.exports = { getRazorpayClient, isRazorpayConfigured, verifyPaymentSignature, verifyWebhookSignature };
