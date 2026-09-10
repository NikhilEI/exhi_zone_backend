-- Relaxes exhibitor_directory_info.booth_type/email/company_profile from
-- NOT NULL to nullable, so a partially-known record (e.g. imported from a
-- legacy system with only hall/booth known) can be saved — the Exhibitor
-- Information form then pre-fills whatever is already known instead of
-- requiring all-or-nothing, and the Booth Design / Fascia Name mandatory
-- forms automatically appear once booth_type actually gets set (by the
-- import, or by the exhibitor filling in the rest themselves) — that gating
-- logic already keys off this column, no code change needed for that part.
--
-- Plain MODIFY COLUMN is naturally idempotent — safe to run again.
--
-- How to run:
--   mysql -u <user> -p <db_name> < migrations/2026-09-10_exhibitor_directory_info_nullable.sql

ALTER TABLE `exhibitor_directory_info`
  MODIFY COLUMN `booth_type` enum('Raw Space','Shell Space') DEFAULT NULL,
  MODIFY COLUMN `email` varchar(255) DEFAULT NULL,
  MODIFY COLUMN `company_profile` varchar(400) DEFAULT NULL;
