-- ============================================================================
-- Exhibitor Zone — production DB changes for today's work (2026-09-10)
-- ============================================================================
--
-- Short version: there is only ONE table involved, and it's a no-op if your
-- production database is already up to date with schema.sql.
--
-- Everything else built today (Razorpay checkout, payment success page,
-- payment history for exhibitors/admin, the Exhibitor Progress module, the
-- CSV Export Data module, the booth-design Yes/No fix, the website-validation
-- fix, the mandatory-forms gating) is application code only — new routes,
-- new pages, new validation logic — and reads/writes tables that already
-- existed. None of it required a schema change.
--
-- The one exception: the Razorpay integration writes to `payment_transactions`.
-- That table was ALREADY present in backend/schema.sql before today (it looks
-- like it was designed in from the start, with encrypted gateway_order_id/
-- gateway_payment_id/gateway_signature columns ready to go) — but if your
-- production database was provisioned from an older copy of schema.sql, or
-- you're not sure, run this file. It's the exact same CREATE TABLE from
-- schema.sql, using IF NOT EXISTS, so it is 100% safe to run against a
-- database that already has this table — it will simply do nothing.
--
-- How to run:
--   mysql -u <user> -p <production_db_name> < migrations/2026-09-10_payment_gateway.sql
--
-- After running this, the only other thing production needs is the Razorpay
-- env vars in backend/.env (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and
-- RAZORPAY_WEBHOOK_SECRET once you've added the webhook in the Razorpay
-- dashboard) — see backend/.env.example for details. No other .env changes
-- are needed for today's work.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `payment_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `event_id` bigint(20) unsigned NOT NULL,
  `invoice_id` bigint(20) unsigned NOT NULL,
  `order_id` bigint(20) unsigned NOT NULL,
  `gateway` varchar(50) NOT NULL COMMENT 'e.g. razorpay, stripe, offline',
  `gateway_order_id_enc` text DEFAULT NULL COMMENT 'ENCRYPTED — AES-256-GCM',
  `gateway_payment_id_enc` text DEFAULT NULL COMMENT 'ENCRYPTED — AES-256-GCM',
  `gateway_signature_enc` text DEFAULT NULL COMMENT 'ENCRYPTED — AES-256-GCM',
  `amount` decimal(15,4) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'INR',
  `payment_method` varchar(50) DEFAULT NULL COMMENT 'card/upi/netbanking/cheque/neft',
  `status` enum('initiated','pending','success','failed','refunded','disputed') NOT NULL DEFAULT 'initiated',
  `gateway_status` varchar(50) DEFAULT NULL,
  `gateway_response` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Raw gateway webhook payload' CHECK (json_valid(`gateway_response`)),
  `processed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pt_uuid` (`uuid`),
  KEY `idx_pt_event` (`event_id`),
  KEY `idx_pt_invoice` (`invoice_id`),
  KEY `idx_pt_order` (`order_id`),
  KEY `idx_pt_status` (`status`),
  CONSTRAINT `fk_pt_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_pt_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `fk_pt_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
