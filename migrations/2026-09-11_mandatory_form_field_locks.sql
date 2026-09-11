-- Replaces the old, import-only "locked_fields" column (which only covered
-- Exhibitor Information and only auto-locked from a legacy Excel import)
-- with a generic, admin-controlled field-lock system covering all 7
-- mandatory forms, with both per-exhibitor and global (all-exhibitors)
-- locks. See src/config/mandatoryFormFields.js for each form's lockable
-- keys and src/utils/mandatoryFormLocks.js for how locks are enforced.
--
-- Run against production with:
--   mysql -u <user> -p <db> < 2026-09-11_mandatory_form_field_locks.sql
--
-- NOTE: as with the last two migrations, run this as a single script (not
-- pasted line-by-line) and verify afterward with DESCRIBE.

ALTER TABLE `exhibitor_directory_info`
  DROP COLUMN IF EXISTS `locked_fields`;

CREATE TABLE IF NOT EXISTS `mandatory_form_field_locks` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL COMMENT '0 = global (applies to every exhibitor in the event)',
  `form_key` varchar(100) NOT NULL,
  `field_key` varchar(100) NOT NULL,
  `locked_by` bigint(20) unsigned DEFAULT NULL,
  `locked_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mffl` (`event_id`,`exhibitor_profile_id`,`form_key`,`field_key`),
  KEY `idx_mffl_lookup` (`event_id`,`form_key`,`exhibitor_profile_id`),
  CONSTRAINT `fk_mffl_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
