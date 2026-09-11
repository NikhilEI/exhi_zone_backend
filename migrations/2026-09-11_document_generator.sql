-- Adds the schema for the admin Document Generator module (starting with
-- Proforma Invoice): a `generated_documents` table tracking every document
-- ever generated (with a full immutable data snapshot + document number),
-- plus a couple of company/event fields the templates need that nothing
-- in the app captured before now.
--
-- Run against production with:
--   mysql -u <user> -p <db> < 2026-09-11_document_generator.sql
--
-- NOTE: these ALTER TABLE statements do NOT use "ADD COLUMN IF NOT EXISTS" —
-- run this file once. If a statement errors with "Duplicate column name",
-- that column is already applied; move on to the next statement. Verify
-- afterward with DESCRIBE companies / DESCRIBE events / DESCRIBE
-- generated_documents, the same way you verified the last migration.

ALTER TABLE `companies`
  ADD COLUMN `msme_registration_number` varchar(50) DEFAULT NULL COMMENT 'e.g. UDYAM-DL-09-0002610 — captured once, reused on every generated invoice for this company.' AFTER `email`,
  ADD COLUMN `gst_state_code` varchar(2) DEFAULT NULL COMMENT 'GST state code, e.g. "33" for Tamil Nadu — combined with `state` for invoice display as "Tamil Nadu-33".' AFTER `msme_registration_number`;

ALTER TABLE `events`
  ADD COLUMN `short_code` varchar(10) DEFAULT NULL COMMENT 'e.g. "CI" for Convergence India — used in generated document numbers like CI/26-27/P/38.' AFTER `edition`;

CREATE TABLE IF NOT EXISTS `generated_documents` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `document_type` varchar(50) NOT NULL COMMENT 'Matches document_uploads.document_type, e.g. proforma_invoice.',
  `document_number` varchar(50) DEFAULT NULL COMMENT 'Assigned on first finalize, e.g. CI/26-27/P/38. Re-finalizing keeps the same number.',
  `sequence_no` int(10) unsigned DEFAULT NULL COMMENT 'Per (event_id, document_type) running sequence, assigned on first finalize.',
  `status` enum('draft','finalized','void') NOT NULL DEFAULT 'draft',
  `data` longtext NOT NULL COMMENT 'Full JSON snapshot of every field used to render the PDF.' CHECK (json_valid(`data`)),
  `pdf_document_upload_id` bigint(20) unsigned DEFAULT NULL,
  `version` int(10) unsigned NOT NULL DEFAULT 1,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `finalized_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gd_uuid` (`uuid`),
  UNIQUE KEY `uq_gd_sequence` (`event_id`,`document_type`,`sequence_no`),
  KEY `idx_gd_event` (`event_id`),
  KEY `idx_gd_profile` (`exhibitor_profile_id`),
  KEY `idx_gd_type` (`event_id`,`document_type`),
  KEY `idx_gd_pdf` (`pdf_document_upload_id`),
  CONSTRAINT `fk_gd_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_gd_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_gd_pdf` FOREIGN KEY (`pdf_document_upload_id`) REFERENCES `document_uploads` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
