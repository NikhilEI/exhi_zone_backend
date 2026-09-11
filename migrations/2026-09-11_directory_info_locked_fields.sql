-- Adds locked_fields to exhibitor_directory_info: a JSON array of column
-- names that were populated by an admin/legacy import (e.g. company_name,
-- booth_type, hall_no) and can therefore only be changed by an admin from
-- then on — a regular exhibitor editing their own Exhibitor Information form
-- can no longer overwrite them. Set once at import time; a field the
-- exhibitor fills in themselves later (e.g. completing a partially-imported
-- profile) is never added to this list.
--
-- Safe to run again — ADD COLUMN IF NOT EXISTS.
--
-- How to run:
--   mysql -u <user> -p <db_name> < migrations/2026-09-11_directory_info_locked_fields.sql

ALTER TABLE `exhibitor_directory_info`
  ADD COLUMN IF NOT EXISTS `locked_fields` text DEFAULT NULL COMMENT 'JSON array of column names populated by an admin/legacy import — only an admin can change these. NULL means nothing is locked.' AFTER `status`;
