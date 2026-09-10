-- Adds an optional `username` column to `users` so login can accept either
-- email OR username. This is what lets every imported legacy exhibitor log
-- in (most of them only had a username in the legacy system, not an email),
-- without weakening the `email` column's own NOT NULL/UNIQUE constraints —
-- accounts imported without a real email get a placeholder @legacy-import.invalid
-- address (RFC 2606 reserved TLD — never a real deliverable domain) purely to
-- satisfy that constraint; they log in with their username instead.
--
-- Safe to run against a database that already has this column — same
-- ADD COLUMN/KEY IF NOT EXISTS pattern as the rest of schema.sql.
--
-- How to run:
--   mysql -u <user> -p <db_name> < migrations/2026-09-10_users_username_login.sql

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `username` varchar(50) DEFAULT NULL COMMENT 'Optional alternate login identifier — e.g. carried over from a legacy system import. Login accepts either this or email.' AFTER `email`,
  ADD UNIQUE KEY IF NOT EXISTS `uq_users_username` (`username`);
