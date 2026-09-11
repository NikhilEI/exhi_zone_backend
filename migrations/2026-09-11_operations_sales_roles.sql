-- Adds the "Operations" and "Sales" staff roles plus a per-account, per-module
-- access toggle so an admin can create a restricted account and pick exactly
-- which admin modules it can reach (Registrations, Stalls, Payments, etc.).
-- See src/config/adminModules.js for the canonical module list and
-- src/middleware/requireModule.js for how it's enforced.
--
-- Safe to run more than once. Run against production with:
--   mysql -u <user> -p <db> < 2026-09-11_operations_sales_roles.sql

ALTER TABLE `user_event_roles`
  ADD COLUMN IF NOT EXISTS `enabled_modules` text DEFAULT NULL COMMENT 'JSON array of admin module keys this grant can access — only enforced for operations/sales roles.' AFTER `is_active`;

INSERT IGNORE INTO `roles` (`name`, `label`, `description`, `is_system`) VALUES
  ('operations', 'Operations', 'Restricted admin access — modules granted individually per account', 1),
  ('sales', 'Sales', 'Restricted admin access — modules granted individually per account', 1);
