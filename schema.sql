-- Exhibitor Zone — standalone database schema.
-- Generated 2026-09-04 from the live wellness_india_expo database by replicating
-- the exhibitor-zone tables into their own project/database (exhi_zone).

CREATE DATABASE IF NOT EXISTS exhi_zone
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE exhi_zone;


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `announcements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `type` enum('info','warning','urgent','maintenance') NOT NULL DEFAULT 'info',
  `target_roles` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'NULL = all roles; array of role names otherwise' CHECK (json_valid(`target_roles`)),
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `published_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_by` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ann_event` (`event_id`),
  KEY `idx_ann_published` (`event_id`,`published_at`),
  KEY `idx_ann_pinned` (`event_id`,`is_pinned`),
  CONSTRAINT `fk_ann_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `action` varchar(100) NOT NULL COMMENT 'e.g. user.login, order.confirmed',
  `entity_type` varchar(100) DEFAULT NULL COMMENT 'e.g. orders, form_submissions',
  `entity_id` bigint(20) unsigned DEFAULT NULL,
  `old_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_value`)),
  `new_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_value`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_event` (`event_id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `cart_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `cart_id` bigint(20) unsigned NOT NULL,
  `service_item_id` bigint(20) unsigned NOT NULL,
  `quantity` int(10) unsigned NOT NULL DEFAULT 1,
  `unit_price` decimal(15,4) NOT NULL COMMENT 'Price at time of add-to-cart',
  `surcharge_pct` decimal(5,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cart_item` (`cart_id`,`service_item_id`),
  KEY `idx_ci_cart` (`cart_id`),
  KEY `idx_ci_item` (`service_item_id`),
  CONSTRAINT `fk_ci_cart` FOREIGN KEY (`cart_id`) REFERENCES `carts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ci_item` FOREIGN KEY (`service_item_id`) REFERENCES `service_items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `carts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL COMMENT 'User who owns this cart session',
  `currency` char(3) NOT NULL DEFAULT 'INR',
  `status` enum('active','checked_out','abandoned','expired') NOT NULL DEFAULT 'active',
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `active_cart_key` varchar(64) GENERATED ALWAYS AS (if(`status` = 'active',concat(`event_id`,'-',`exhibitor_profile_id`),NULL)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_carts_uuid` (`uuid`),
  UNIQUE KEY `uq_active_cart` (`active_cart_key`),
  KEY `idx_carts_event` (`event_id`),
  KEY `idx_carts_profile` (`exhibitor_profile_id`),
  CONSTRAINT `fk_carts_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_carts_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `legal_name` varchar(255) NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `brand_name` varchar(255) DEFAULT NULL,
  `registration_number` varchar(100) DEFAULT NULL,
  `gst_number_enc` text DEFAULT NULL COMMENT 'ENCRYPTED — AES-256-GCM',
  `pan_number_enc` text DEFAULT NULL COMMENT 'ENCRYPTED — AES-256-GCM',
  `industry_type` varchar(100) DEFAULT NULL,
  `company_type` enum('private_limited','public_limited','partnership','llp','proprietorship','ngo','government','other') DEFAULT NULL,
  `website` varchar(1024) DEFAULT NULL,
  `logo_url` varchar(1024) DEFAULT NULL,
  `address_line1` varchar(255) DEFAULT NULL,
  `address_line2` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `country` varchar(100) NOT NULL DEFAULT 'India',
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(254) DEFAULT NULL,
  `msme_registration_number` varchar(50) DEFAULT NULL COMMENT 'e.g. UDYAM-DL-09-0002610 — captured once, reused on every generated invoice for this company.',
  `gst_state_code` varchar(2) DEFAULT NULL COMMENT 'GST state code, e.g. "33" for Tamil Nadu — combined with `state` for invoice display as "Tamil Nadu-33".',
  `is_verified` tinyint(1) NOT NULL DEFAULT 0,
  `verified_at` datetime DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_companies_uuid` (`uuid`),
  KEY `idx_companies_name` (`display_name`),
  KEY `idx_companies_deleted` (`deleted_at`),
  KEY `idx_companies_verified` (`is_verified`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `document_uploads` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned DEFAULT NULL,
  `submission_id` bigint(20) unsigned DEFAULT NULL,
  `uploaded_by` bigint(20) unsigned NOT NULL,
  `document_type` varchar(100) NOT NULL COMMENT 'e.g. gst_certificate, company_logo',
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL COMMENT 'UUID-based server filename',
  `storage_path` varchar(1024) NOT NULL COMMENT 'Relative path or S3 key',
  `storage_backend` enum('local','s3','gcs') NOT NULL DEFAULT 'local',
  `mime_type` varchar(100) NOT NULL,
  `file_size_bytes` int(10) unsigned NOT NULL,
  `checksum_sha256` char(64) NOT NULL,
  `is_verified` tinyint(1) NOT NULL DEFAULT 0,
  `verified_at` datetime DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_du_uuid` (`uuid`),
  KEY `idx_du_event` (`event_id`),
  KEY `idx_du_profile` (`exhibitor_profile_id`),
  KEY `idx_du_submission` (`submission_id`),
  KEY `idx_du_type` (`event_id`,`document_type`),
  CONSTRAINT `fk_du_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_du_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_du_submission` FOREIGN KEY (`submission_id`) REFERENCES `form_submissions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
-- One row per document generated via the admin Document Generator (Proforma
-- Invoice, and future types). `data` is a full immutable snapshot of every
-- field used to render the PDF — mirrors how `invoices.billing_name`/
-- `billing_address` already snapshot rather than join live, so a historical
-- document stays byte-identical even if the exhibitor's profile changes
-- later. `pdf_document_upload_id` points at the actual rendered file, stored
-- as a normal `document_uploads` row so it surfaces in the existing admin
-- and exhibitor Documents pages with no extra work.
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `event_copy_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `source_event_id` bigint(20) unsigned NOT NULL,
  `target_event_id` bigint(20) unsigned NOT NULL,
  `copied_domains` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Array: ["forms","catalogue","pass_types"]' CHECK (json_valid(`copied_domains`)),
  `performed_by` bigint(20) unsigned DEFAULT NULL,
  `performed_at` datetime NOT NULL DEFAULT current_timestamp(),
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_copy_log_source` (`source_event_id`),
  KEY `idx_copy_log_target` (`target_event_id`),
  CONSTRAINT `fk_copy_log_source` FOREIGN KEY (`source_event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_copy_log_target` FOREIGN KEY (`target_event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `event_settings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `setting_key` varchar(100) NOT NULL COMMENT 'e.g. late_order_surcharge_pct, fascia_deadline',
  `value` text NOT NULL COMMENT 'JSON or scalar string',
  `data_type` enum('string','integer','decimal','boolean','json','date') NOT NULL DEFAULT 'string',
  `description` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_event_settings` (`event_id`,`setting_key`),
  KEY `idx_event_settings_event` (`event_id`),
  CONSTRAINT `fk_event_settings_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `name` varchar(255) NOT NULL,
  `slug` varchar(100) NOT NULL COMMENT 'URL-friendly identifier',
  `edition` varchar(50) DEFAULT NULL COMMENT 'e.g. 2024, 2025-Q1',
  `short_code` varchar(10) DEFAULT NULL COMMENT 'e.g. "CI" for Convergence India — used in generated document numbers like CI/26-27/P/38.',
  `tagline` varchar(500) DEFAULT NULL,
  `venue_name` varchar(255) DEFAULT NULL,
  `venue_address` text DEFAULT NULL,
  `venue_city` varchar(100) DEFAULT NULL,
  `venue_country` varchar(100) DEFAULT 'India',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `setup_start_date` date DEFAULT NULL,
  `teardown_end_date` date DEFAULT NULL,
  `reg_open_date` date DEFAULT NULL COMMENT 'Exhibitor registration opens',
  `reg_close_date` date DEFAULT NULL COMMENT 'Exhibitor registration closes',
  `primary_currency` char(3) NOT NULL DEFAULT 'INR' COMMENT 'ISO 4217',
  `secondary_currency` char(3) DEFAULT 'USD',
  `exchange_rate` decimal(15,6) DEFAULT NULL COMMENT 'secondary/primary rate',
  `logo_url` varchar(1024) DEFAULT NULL,
  `banner_url` varchar(1024) DEFAULT NULL,
  `status` enum('draft','published','active','completed','cancelled') NOT NULL DEFAULT 'draft',
  `max_exhibitors` int(10) unsigned DEFAULT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'Asia/Kolkata',
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_events_uuid` (`uuid`),
  UNIQUE KEY `uq_events_slug` (`slug`),
  KEY `idx_events_status` (`status`),
  KEY `idx_events_dates` (`start_date`,`end_date`),
  KEY `idx_events_deleted` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `exhibitor_directory_info` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `company_name` varchar(255) NOT NULL,
  `brand_name` varchar(255) NOT NULL,
  `hall_no` varchar(50) DEFAULT NULL,
  `zone` varchar(100) DEFAULT NULL,
  `booth_no` varchar(50) DEFAULT NULL,
  `booth_type` enum('Raw Space','Shell Space') DEFAULT NULL COMMENT 'Nullable so a partially-known record (e.g. a legacy import that only has hall/booth) can still be saved — the Booth Design / Fascia Name mandatory forms only appear once this is actually set, whoever sets it.',
  `booth_size` decimal(10,2) DEFAULT NULL,
  `booth_width` decimal(10,2) DEFAULT NULL,
  `booth_depth` decimal(10,2) DEFAULT NULL,
  `booth_location` enum('1 Side Open','2 Side Open','3 Side Open','4 Side Open') DEFAULT NULL,
  `country` varchar(100) NOT NULL,
  `country_code` varchar(10) NOT NULL,
  `phone_no` varchar(30) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL COMMENT 'Nullable for the same reason as booth_type — see above.',
  `website` varchar(500) DEFAULT NULL,
  `company_profile` varchar(400) DEFAULT NULL COMMENT 'Nullable for the same reason as booth_type — see above.',
  `company_logo_document_id` bigint(20) unsigned DEFAULT NULL,
  `contact_name` varchar(150) DEFAULT NULL,
  `contact_designation` varchar(150) DEFAULT NULL,
  `contact_phone` varchar(30) DEFAULT NULL,
  `contact_email` varchar(254) DEFAULT NULL,
  `contact_alternate_email` varchar(254) DEFAULT NULL,
  `status` enum('pending','completed') NOT NULL DEFAULT 'completed',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_edi_profile_event` (`exhibitor_profile_id`,`event_id`),
  KEY `fk_edi_event` (`event_id`),
  KEY `fk_edi_logo` (`company_logo_document_id`),
  CONSTRAINT `fk_edi_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_edi_logo` FOREIGN KEY (`company_logo_document_id`) REFERENCES `document_uploads` (`id`),
  CONSTRAINT `fk_edi_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;

-- Idempotent column additions for existing databases (schema.sql is applied
-- via CREATE TABLE IF NOT EXISTS, which does not alter tables that already exist).
ALTER TABLE `exhibitor_directory_info`
  ADD COLUMN IF NOT EXISTS `booth_size` decimal(10,2) DEFAULT NULL AFTER `booth_type`,
  ADD COLUMN IF NOT EXISTS `booth_width` decimal(10,2) DEFAULT NULL AFTER `booth_size`,
  ADD COLUMN IF NOT EXISTS `booth_depth` decimal(10,2) DEFAULT NULL AFTER `booth_width`,
  ADD COLUMN IF NOT EXISTS `booth_location` enum('1 Side Open','2 Side Open','3 Side Open','4 Side Open') DEFAULT NULL AFTER `booth_depth`,
  ADD COLUMN IF NOT EXISTS `contact_name` varchar(150) DEFAULT NULL AFTER `company_logo_document_id`,
  ADD COLUMN IF NOT EXISTS `contact_designation` varchar(150) DEFAULT NULL AFTER `contact_name`,
  ADD COLUMN IF NOT EXISTS `contact_phone` varchar(30) DEFAULT NULL AFTER `contact_designation`,
  ADD COLUMN IF NOT EXISTS `contact_email` varchar(254) DEFAULT NULL AFTER `contact_phone`,
  ADD COLUMN IF NOT EXISTS `contact_alternate_email` varchar(254) DEFAULT NULL AFTER `contact_email`;

-- Relaxes booth_type/email/company_profile from NOT NULL to nullable, so a
-- partially-known record (e.g. imported from a legacy system with only
-- hall/booth known) can be saved and pre-fill the Exhibitor Information form
-- with whatever is known, rather than requiring all-or-nothing. Plain
-- MODIFY COLUMN is naturally idempotent — safe to run again.
ALTER TABLE `exhibitor_directory_info`
  MODIFY COLUMN `booth_type` enum('Raw Space','Shell Space') DEFAULT NULL,
  MODIFY COLUMN `email` varchar(255) DEFAULT NULL,
  MODIFY COLUMN `company_profile` varchar(400) DEFAULT NULL;

-- `locked_fields` (auto-set at import time) has been replaced by the
-- `mandatory_form_field_locks` table below, which covers all 7 mandatory
-- forms with admin-controlled per-exhibitor AND global locks instead of a
-- single auto-populated column on just this one table. Idempotent for
-- existing databases that still have the old column.
ALTER TABLE `exhibitor_directory_info`
  DROP COLUMN IF EXISTS `locked_fields`;

-- Booth Design Submission's actual content and review workflow live in the
-- generic form_templates/form_submissions system (see forms.js) instead of a
-- bespoke table, so it gets version tracking and admin review for free. A
-- `booth_design_submissions` table briefly existed here and has been removed.

CREATE TABLE IF NOT EXISTS `exhibitor_event_profiles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `event_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `profile_code` varchar(30) DEFAULT NULL COMMENT 'Organiser assigned code e.g. EXH-2024-001',
  `category` varchar(100) DEFAULT NULL COMMENT 'Product/service category',
  `sub_category` varchar(100) DEFAULT NULL,
  `participation_type` enum('standalone','group','pavilion','co_exhibitor') NOT NULL DEFAULT 'standalone',
  `parent_profile_id` bigint(20) unsigned DEFAULT NULL COMMENT 'For co-exhibitors',
  `fascia_name` varchar(255) DEFAULT NULL COMMENT 'Name to appear on fascia board',
  `profile_status` enum('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
  `approved_at` datetime DEFAULT NULL,
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `internal_notes` text DEFAULT NULL,
  `onboarding_step` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `terms_accepted_at` datetime DEFAULT NULL,
  `terms_version` varchar(20) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_eep_uuid` (`uuid`),
  UNIQUE KEY `uq_eep_event_company` (`event_id`,`company_id`),
  KEY `idx_eep_event` (`event_id`),
  KEY `idx_eep_company` (`company_id`),
  KEY `idx_eep_status` (`profile_status`),
  KEY `idx_eep_parent` (`parent_profile_id`),
  CONSTRAINT `fk_eep_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_eep_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_eep_parent` FOREIGN KEY (`parent_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `exhibitor_product_categories` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `subcategory_id` int(10) unsigned NOT NULL,
  `other_specification` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_epc` (`exhibitor_profile_id`,`event_id`,`subcategory_id`),
  KEY `fk_epc_event` (`event_id`),
  KEY `fk_epc_subcategory` (`subcategory_id`),
  CONSTRAINT `fk_epc_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_epc_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_epc_subcategory` FOREIGN KEY (`subcategory_id`) REFERENCES `product_subcategories` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `form_submission_history` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `submission_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `changed_by` bigint(20) unsigned NOT NULL,
  `from_status` enum('draft','submitted','changes_requested','approved','rejected') DEFAULT NULL,
  `to_status` enum('draft','submitted','changes_requested','approved','rejected') NOT NULL,
  `notes` text DEFAULT NULL,
  `data_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Snapshot of data at time of change' CHECK (json_valid(`data_snapshot`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fsh_submission` (`submission_id`),
  KEY `idx_fsh_event` (`event_id`),
  KEY `idx_fsh_changed_by` (`changed_by`),
  CONSTRAINT `fk_fsh_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_fsh_submission` FOREIGN KEY (`submission_id`) REFERENCES `form_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `form_submissions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `form_template_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `submitted_by` bigint(20) unsigned NOT NULL COMMENT 'User who last saved/submitted',
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Field values keyed by field slug' CHECK (json_valid(`data`)),
  `status` enum('draft','submitted','changes_requested','approved','rejected') NOT NULL DEFAULT 'draft',
  `reviewer_id` bigint(20) unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `reviewer_notes` text DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL COMMENT 'Set after approval — prevents edits',
  `version` smallint(5) unsigned NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fs_uuid` (`uuid`),
  KEY `idx_fs_event` (`event_id`),
  KEY `idx_fs_profile` (`exhibitor_profile_id`),
  KEY `idx_fs_template` (`form_template_id`),
  KEY `idx_fs_status` (`event_id`,`status`),
  KEY `idx_fs_submitted_by` (`submitted_by`),
  CONSTRAINT `fk_fs_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_fs_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_fs_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_fs_template` FOREIGN KEY (`form_template_id`) REFERENCES `form_templates` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `form_templates` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `event_id` bigint(20) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `form_type` varchar(100) NOT NULL COMMENT 'e.g. directory_profile, fascia, electrical',
  `schema` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Field definitions array' CHECK (json_valid(`schema`)),
  `version` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `deadline` datetime DEFAULT NULL,
  `requires_approval` tinyint(1) NOT NULL DEFAULT 1,
  `allow_multiple` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_form_templates_uuid` (`uuid`),
  UNIQUE KEY `uq_form_templates_slug` (`event_id`,`slug`),
  KEY `idx_ft_event` (`event_id`),
  KEY `idx_ft_active` (`event_id`,`is_active`),
  CONSTRAINT `fk_ft_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `invoice_number` varchar(50) NOT NULL COMMENT 'e.g. INV-2024-00001',
  `event_id` bigint(20) unsigned NOT NULL,
  `order_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `billing_name` varchar(255) NOT NULL,
  `billing_address` text NOT NULL,
  `billing_gst_enc` text DEFAULT NULL COMMENT 'ENCRYPTED — AES-256-GCM',
  `currency` char(3) NOT NULL DEFAULT 'INR',
  `subtotal` decimal(15,4) NOT NULL,
  `tax_total` decimal(15,4) NOT NULL,
  `grand_total` decimal(15,4) NOT NULL,
  `amount_paid` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `amount_due` decimal(15,4) NOT NULL,
  `due_date` date DEFAULT NULL,
  `invoice_status` enum('draft','sent','partially_paid','paid','overdue','void') NOT NULL DEFAULT 'draft',
  `pdf_url` varchar(1024) DEFAULT NULL,
  `issued_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `voided_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_uuid` (`uuid`),
  UNIQUE KEY `uq_invoices_number` (`invoice_number`),
  KEY `idx_inv_event` (`event_id`),
  KEY `idx_inv_order` (`order_id`),
  KEY `idx_inv_profile` (`exhibitor_profile_id`),
  KEY `idx_inv_status` (`event_id`,`invoice_status`),
  CONSTRAINT `fk_inv_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_inv_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_inv_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `mandatory_form_definitions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `form_key` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mfd` (`event_id`,`form_key`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `mandatory_form_status` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `form_key` varchar(100) NOT NULL,
  `status` enum('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mfs` (`exhibitor_profile_id`,`event_id`,`form_key`),
  KEY `fk_mfs_event` (`event_id`),
  CONSTRAINT `fk_mfs_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_mfs_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
-- Admin-controlled field locking across all 7 mandatory forms (see
-- src/config/mandatoryFormFields.js for each form's lockable field/action
-- keys). Replaces the old exhibitor_directory_info.locked_fields column,
-- which only covered Exhibitor Information and only auto-locked from
-- import — everything here is a deliberate admin action instead, and
-- covers every mandatory form.
--
-- `exhibitor_profile_id` = 0 is a reserved sentinel meaning GLOBAL (locked
-- for every exhibitor in the event) rather than one specific company —
-- deliberately not NULL, since MySQL's unique-key semantics treat every
-- NULL as distinct and would silently allow duplicate "global" rows for
-- the same field. Because of that sentinel, this column intentionally has
-- no FK to exhibitor_event_profiles (id 0 never exists there).
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `notification_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `template_id` bigint(20) unsigned DEFAULT NULL,
  `exhibitor_profile_id` bigint(20) unsigned DEFAULT NULL,
  `recipient_user_id` bigint(20) unsigned DEFAULT NULL,
  `channel` enum('email','sms','in_app') NOT NULL,
  `recipient_address` varchar(254) NOT NULL COMMENT 'Email/phone',
  `subject` varchar(500) DEFAULT NULL,
  `body_preview` varchar(500) DEFAULT NULL COMMENT 'First 500 chars for preview',
  `status` enum('queued','sent','delivered','failed','bounced') NOT NULL DEFAULT 'queued',
  `provider` varchar(50) DEFAULT NULL COMMENT 'nodemailer/sendgrid/twilio etc.',
  `provider_message_id` varchar(255) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `retry_count` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_nl_event` (`event_id`),
  KEY `idx_nl_profile` (`exhibitor_profile_id`),
  KEY `idx_nl_user` (`recipient_user_id`),
  KEY `idx_nl_status` (`event_id`,`status`),
  KEY `idx_nl_template` (`template_id`),
  CONSTRAINT `fk_nl_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_nl_template` FOREIGN KEY (`template_id`) REFERENCES `notification_templates` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `notification_templates` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `slug` varchar(100) NOT NULL COMMENT 'e.g. order_confirmed, form_approved',
  `channel` enum('email','sms','in_app') NOT NULL DEFAULT 'email',
  `subject` varchar(500) DEFAULT NULL COMMENT 'For email channel',
  `body_html` text DEFAULT NULL COMMENT 'Handlebars-compatible template',
  `body_text` text DEFAULT NULL COMMENT 'Plain text fallback',
  `variables` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of variable names used in template' CHECK (json_valid(`variables`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nt_slug_event_channel` (`event_id`,`slug`,`channel`),
  KEY `idx_nt_event` (`event_id`),
  CONSTRAINT `fk_nt_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `title` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `type` enum('info','success','warning','error') NOT NULL DEFAULT 'info',
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_unread` (`user_id`,`is_read`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `service_item_id` bigint(20) unsigned NOT NULL,
  `sku_snapshot` varchar(100) NOT NULL COMMENT 'SKU at time of order',
  `name_snapshot` varchar(255) NOT NULL COMMENT 'Name at time of order',
  `quantity` int(10) unsigned NOT NULL DEFAULT 1,
  `unit_price` decimal(15,4) NOT NULL,
  `surcharge_pct` decimal(5,2) NOT NULL DEFAULT 0.00,
  `surcharge_amount` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `tax_rate_pct` decimal(5,2) NOT NULL DEFAULT 18.00,
  `tax_amount` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `line_total` decimal(15,4) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'INR',
  `fulfillment_status` enum('pending','delivered','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_oi_order` (`order_id`),
  KEY `idx_oi_event` (`event_id`),
  KEY `idx_oi_item` (`service_item_id`),
  CONSTRAINT `fk_oi_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_oi_item` FOREIGN KEY (`service_item_id`) REFERENCES `service_items` (`id`),
  CONSTRAINT `fk_oi_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `orders` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `order_number` varchar(50) NOT NULL COMMENT 'Human readable: ORD-2024-00001',
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `placed_by` bigint(20) unsigned NOT NULL,
  `cart_id` bigint(20) unsigned DEFAULT NULL,
  `currency` char(3) NOT NULL DEFAULT 'INR',
  `subtotal` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `surcharge_total` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `tax_total` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `discount_total` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `grand_total` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `status` enum('pending','confirmed','processing','fulfilled','cancelled','refunded','partially_refunded') NOT NULL DEFAULT 'pending',
  `payment_status` enum('unpaid','partially_paid','paid','refunded') NOT NULL DEFAULT 'unpaid',
  `notes` text DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `cancelled_by` bigint(20) unsigned DEFAULT NULL,
  `cancellation_reason` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_uuid` (`uuid`),
  UNIQUE KEY `uq_orders_number` (`order_number`),
  KEY `idx_orders_event` (`event_id`),
  KEY `idx_orders_profile` (`exhibitor_profile_id`),
  KEY `idx_orders_status` (`event_id`,`status`),
  KEY `idx_orders_payment` (`event_id`,`payment_status`),
  KEY `idx_orders_placed_by` (`placed_by`),
  CONSTRAINT `fk_orders_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_orders_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `pass_allocations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `pass_type_id` bigint(20) unsigned NOT NULL,
  `allocated_qty` int(10) unsigned NOT NULL DEFAULT 0,
  `issued_qty` int(10) unsigned NOT NULL DEFAULT 0,
  `allocated_by` bigint(20) unsigned DEFAULT NULL,
  `allocated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pa_profile_type` (`exhibitor_profile_id`,`pass_type_id`),
  KEY `idx_pa_event` (`event_id`),
  KEY `idx_pa_profile` (`exhibitor_profile_id`),
  KEY `idx_pa_type` (`pass_type_id`),
  CONSTRAINT `fk_pa_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_pa_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_pa_type` FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `pass_print_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pass_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `action` enum('download','print','email_send','reprint') NOT NULL,
  `performed_by` bigint(20) unsigned NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ppl_pass` (`pass_id`),
  KEY `idx_ppl_event` (`event_id`),
  CONSTRAINT `fk_ppl_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_ppl_pass` FOREIGN KEY (`pass_id`) REFERENCES `passes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `pass_types` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'e.g. Exhibitor Staff, Contractor, VIP',
  `code` varchar(30) NOT NULL,
  `description` text DEFAULT NULL,
  `color_hex` char(7) DEFAULT NULL COMMENT 'Badge color e.g. #3498DB',
  `access_zones` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of zone codes this pass grants' CHECK (json_valid(`access_zones`)),
  `max_per_stall` int(10) unsigned DEFAULT NULL,
  `total_quota` int(10) unsigned DEFAULT NULL,
  `issued_count` int(10) unsigned NOT NULL DEFAULT 0,
  `valid_from` datetime DEFAULT NULL,
  `valid_until` datetime DEFAULT NULL,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pt_code_event` (`event_id`,`code`),
  KEY `idx_pt_event` (`event_id`),
  CONSTRAINT `fk_pass_types_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `passes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `qr_code` char(36) NOT NULL DEFAULT '' COMMENT 'Scannable unique QR token',
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `pass_type_id` bigint(20) unsigned NOT NULL,
  `allocation_id` bigint(20) unsigned NOT NULL,
  `holder_first_name` varchar(100) NOT NULL,
  `holder_last_name` varchar(100) NOT NULL,
  `holder_email` varchar(254) DEFAULT NULL,
  `holder_phone` varchar(30) DEFAULT NULL,
  `holder_job_title` varchar(150) DEFAULT NULL,
  `holder_photo_url` varchar(1024) DEFAULT NULL,
  `issued_to_user_id` bigint(20) unsigned DEFAULT NULL,
  `status` enum('draft','issued','printed','voided','lost') NOT NULL DEFAULT 'draft',
  `issued_at` datetime DEFAULT NULL,
  `voided_at` datetime DEFAULT NULL,
  `voided_by` bigint(20) unsigned DEFAULT NULL,
  `void_reason` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_passes_uuid` (`uuid`),
  UNIQUE KEY `uq_passes_qr` (`qr_code`),
  KEY `idx_passes_event` (`event_id`),
  KEY `idx_passes_profile` (`exhibitor_profile_id`),
  KEY `idx_passes_type` (`pass_type_id`),
  KEY `idx_passes_status` (`event_id`,`status`),
  KEY `fk_passes_allocation` (`allocation_id`),
  CONSTRAINT `fk_passes_allocation` FOREIGN KEY (`allocation_id`) REFERENCES `pass_allocations` (`id`),
  CONSTRAINT `fk_passes_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_passes_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_passes_type` FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL COMMENT 'SHA-256 of the one-time token',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prt_token` (`token_hash`),
  KEY `idx_prt_user` (`user_id`),
  KEY `idx_prt_expiry` (`expires_at`),
  CONSTRAINT `fk_prt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `principal_agent_meta` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `no_principal_agent` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pam` (`exhibitor_profile_id`,`event_id`),
  KEY `fk_pam_event` (`event_id`),
  CONSTRAINT `fk_pam_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_pam_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `principal_agent_records` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `type` enum('Principal','Agent') NOT NULL,
  `company_name` varchar(255) NOT NULL,
  `website` varchar(500) DEFAULT NULL,
  `country_name` varchar(100) NOT NULL,
  `country_code` varchar(10) NOT NULL,
  `sector_id` int(10) unsigned DEFAULT NULL,
  `custom_sector` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_par_profile` (`exhibitor_profile_id`),
  KEY `fk_par_event` (`event_id`),
  KEY `fk_par_sector` (`sector_id`),
  CONSTRAINT `fk_par_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_par_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_par_sector` FOREIGN KEY (`sector_id`) REFERENCES `principal_agent_sectors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `badge_records` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `badge_id` varchar(20) DEFAULT NULL COMMENT 'e.g. CI/2027/00001 — assigned right after insert, unique per badge',
  `full_name` varchar(150) NOT NULL,
  `designation` varchar(150) NOT NULL,
  `company_name` varchar(255) NOT NULL,
  `country` varchar(100) NOT NULL,
  `country_code` varchar(10) NOT NULL,
  `mobile_no` varchar(20) NOT NULL,
  `email` varchar(254) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_badge_id` (`badge_id`),
  KEY `fk_badge_profile` (`exhibitor_profile_id`),
  KEY `fk_badge_event` (`event_id`),
  CONSTRAINT `fk_badge_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_badge_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotent column addition for existing databases.
ALTER TABLE `badge_records`
  ADD COLUMN IF NOT EXISTS `badge_id` varchar(20) DEFAULT NULL COMMENT 'e.g. CI/2027/00001 — assigned right after insert, unique per badge' AFTER `event_id`,
  ADD UNIQUE KEY IF NOT EXISTS `uq_badge_id` (`badge_id`);
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `principal_agent_sectors` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pas_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `product_categories` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pc_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `product_subcategories` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `category_id` int(10) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_psc` (`category_id`,`name`),
  CONSTRAINT `fk_psc_category` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=186 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `roles` (
  `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT 'super_admin|organiser|exhibitor_admin|exhibitor_staff|finance|operations|sales',
  `label` varchar(100) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=built-in, cannot delete',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `service_categories` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `icon_url` varchar(1024) DEFAULT NULL,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sc_slug_event` (`event_id`,`slug`),
  KEY `idx_sc_event` (`event_id`),
  KEY `idx_sc_active` (`event_id`,`is_active`),
  CONSTRAINT `fk_sc_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `service_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `event_id` bigint(20) unsigned NOT NULL,
  `category_id` bigint(20) unsigned NOT NULL,
  `sku` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL COMMENT 'e.g. per sqm, per unit, per day',
  `price_inr` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `price_usd` decimal(15,4) DEFAULT NULL,
  `late_surcharge_pct` decimal(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Percentage added after deadline',
  `late_surcharge_from` datetime DEFAULT NULL,
  `tax_rate_pct` decimal(5,2) NOT NULL DEFAULT 18.00 COMMENT 'GST/VAT %',
  `min_order_qty` int(10) unsigned NOT NULL DEFAULT 1,
  `max_order_qty` int(10) unsigned DEFAULT NULL,
  `inventory_total` int(10) unsigned DEFAULT NULL COMMENT 'NULL = unlimited',
  `inventory_reserved` int(10) unsigned NOT NULL DEFAULT 0,
  `inventory_sold` int(10) unsigned NOT NULL DEFAULT 0,
  `requires_sq_footage` tinyint(1) NOT NULL DEFAULT 0,
  `requires_terms` tinyint(1) NOT NULL DEFAULT 1,
  `image_url` varchar(1024) DEFAULT NULL,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_si_uuid` (`uuid`),
  UNIQUE KEY `uq_si_sku_event` (`event_id`,`sku`),
  KEY `idx_si_event` (`event_id`),
  KEY `idx_si_category` (`category_id`),
  KEY `idx_si_active` (`event_id`,`is_active`),
  CONSTRAINT `fk_si_category` FOREIGN KEY (`category_id`) REFERENCES `service_categories` (`id`),
  CONSTRAINT `fk_si_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=60 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `token_hash` char(64) NOT NULL COMMENT 'SHA-256 of the cookie token',
  `user_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned DEFAULT NULL COMMENT 'Active event context',
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Session metadata (MFA step, selected_role, etc.)' CHECK (json_valid(`payload`)),
  `last_activity` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sessions_token` (`token_hash`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_expiry` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=74 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
-- Pre-account leads captured by a "reserve your space" style enquiry form —
-- reviewed by an admin (see routes/exhibitorZone/admin/registrations.js) and
-- converted into a real exhibitor account (company + login + default pass)
-- once qualified. Referenced by that route since it was built, but this
-- table itself was missing from the schema, so the Registrations admin page
-- 500'd on every load — this restores it. Nothing currently POSTs new rows
-- into it (no public-facing enquiry form exists yet); the page will load
-- correctly but show an empty list until one does.
CREATE TABLE IF NOT EXISTS `space_bookings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned DEFAULT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `organisation` varchar(255) NOT NULL,
  `designation` varchar(150) DEFAULT NULL,
  `email` varchar(254) NOT NULL,
  `mobile_no` varchar(30) NOT NULL,
  `city` varchar(100) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `learn_about_expo` varchar(255) DEFAULT NULL COMMENT 'How they heard about the expo',
  `shell_space` varchar(100) DEFAULT NULL COMMENT 'Shell space requirement, free text as captured on the enquiry form',
  `business_intrest` text DEFAULT NULL COMMENT 'Business interest — column name matches the original enquiry form field',
  `exhibitor_profile_id` bigint(20) unsigned DEFAULT NULL COMMENT 'Set once converted',
  `converted_at` datetime DEFAULT NULL,
  `converted_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_sb_event` (`event_id`),
  KEY `idx_sb_profile` (`exhibitor_profile_id`),
  KEY `idx_sb_converted_by` (`converted_by`),
  CONSTRAINT `fk_sb_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_sb_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_sb_converted_by` FOREIGN KEY (`converted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `sound_noise_guideline_acknowledgement` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `acknowledged` tinyint(1) NOT NULL DEFAULT 0,
  `acknowledged_at` datetime DEFAULT NULL,
  `guideline_version` smallint(5) unsigned NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_snga` (`exhibitor_profile_id`,`event_id`),
  KEY `fk_snga_event` (`event_id`),
  CONSTRAINT `fk_snga_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_snga_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `stall_allocations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stall_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `allocated_by` bigint(20) unsigned DEFAULT NULL,
  `allocated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `released_at` datetime DEFAULT NULL,
  `released_by` bigint(20) unsigned DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_stall_alloc_stall` (`stall_id`),
  KEY `idx_stall_alloc_event` (`event_id`),
  KEY `idx_stall_alloc_profile` (`exhibitor_profile_id`),
  CONSTRAINT `fk_sa_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_sa_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_sa_stall` FOREIGN KEY (`stall_id`) REFERENCES `stalls` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `stalls` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `stall_number` varchar(30) NOT NULL COMMENT 'e.g. A-101, Hall-3-205',
  `hall` varchar(100) DEFAULT NULL,
  `block` varchar(50) DEFAULT NULL,
  `row` varchar(20) DEFAULT NULL,
  `stall_type` varchar(100) DEFAULT NULL COMMENT 'e.g. raw_space, shell_scheme, double_decker',
  `area_sqm` decimal(8,2) DEFAULT NULL,
  `frontage_m` decimal(6,2) DEFAULT NULL,
  `depth_m` decimal(6,2) DEFAULT NULL,
  `floor_plan_url` varchar(1024) DEFAULT NULL,
  `status` enum('available','held','booked','blocked') NOT NULL DEFAULT 'available',
  `held_until` datetime DEFAULT NULL COMMENT 'Auto-release time when status=held',
  `price_inr` decimal(15,4) DEFAULT NULL,
  `price_usd` decimal(15,4) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stalls_number_event` (`event_id`,`stall_number`),
  KEY `idx_stalls_event` (`event_id`),
  KEY `idx_stalls_status` (`status`),
  KEY `idx_stalls_hall` (`event_id`,`hall`),
  CONSTRAINT `fk_stalls_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `terms_acknowledgements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint(20) unsigned NOT NULL,
  `exhibitor_profile_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `terms_version` varchar(20) NOT NULL,
  `terms_document_url` varchar(1024) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `acknowledged_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ta_event` (`event_id`),
  KEY `idx_ta_profile` (`exhibitor_profile_id`),
  KEY `idx_ta_user` (`user_id`),
  CONSTRAINT `fk_ta_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),
  CONSTRAINT `fk_ta_profile` FOREIGN KEY (`exhibitor_profile_id`) REFERENCES `exhibitor_event_profiles` (`id`),
  CONSTRAINT `fk_ta_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `user_event_roles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `role_id` tinyint(3) unsigned NOT NULL,
  `company_id` bigint(20) unsigned DEFAULT NULL COMMENT 'NULL for organiser/admin roles',
  `granted_by` bigint(20) unsigned DEFAULT NULL,
  `granted_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `enabled_modules` text DEFAULT NULL COMMENT 'JSON array of admin module keys (see src/config/adminModules.js) this grant can access — only enforced for operations/sales roles; NULL/ignored for every other role, which always has full access.' CHECK (json_valid(`enabled_modules`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_event_role` (`user_id`,`event_id`,`role_id`,`company_id`),
  KEY `idx_uer_user` (`user_id`),
  KEY `idx_uer_event` (`event_id`),
  KEY `idx_uer_company` (`company_id`),
  KEY `idx_uer_role` (`role_id`),
  CONSTRAINT `fk_uer_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uer_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  CONSTRAINT `fk_uer_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT '',
  `email` varchar(254) NOT NULL,
  `username` varchar(50) DEFAULT NULL COMMENT 'Optional alternate login identifier — e.g. carried over from a legacy system import. Login accepts either this or email.',
  `email_verified_at` datetime DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL COMMENT 'Argon2id hash — NEVER AES',
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `phone_verified_at` datetime DEFAULT NULL,
  `avatar_url` varchar(1024) DEFAULT NULL,
  `job_title` varchar(150) DEFAULT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'Asia/Kolkata',
  `locale` varchar(10) NOT NULL DEFAULT 'en-IN',
  `mfa_secret_enc` text DEFAULT NULL COMMENT 'ENCRYPTED — AES-256-GCM TOTP secret',
  `mfa_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `mfa_backup_codes_enc` text DEFAULT NULL COMMENT 'ENCRYPTED — JSON array of backup codes',
  `login_attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `last_login_ip` varchar(45) DEFAULT NULL COMMENT 'IPv4 or IPv6',
  `password_changed_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_uuid` (`uuid`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `idx_users_active` (`is_active`,`deleted_at`),
  KEY `idx_users_locked` (`locked_until`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotent column addition for existing databases.
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `username` varchar(50) DEFAULT NULL COMMENT 'Optional alternate login identifier — e.g. carried over from a legacy system import. Login accepts either this or email.' AFTER `email`,
  ADD UNIQUE KEY IF NOT EXISTS `uq_users_username` (`username`);

-- Idempotent column addition for existing databases — see user_event_roles above.
ALTER TABLE `user_event_roles`
  ADD COLUMN IF NOT EXISTS `enabled_modules` text DEFAULT NULL COMMENT 'JSON array of admin module keys this grant can access — only enforced for operations/sales roles.' AFTER `is_active`;

-- Operations and Sales are restricted admin-tier roles: an admin creates
-- these accounts and picks exactly which admin modules each one can reach
-- (see enabled_modules above and src/config/adminModules.js). INSERT IGNORE
-- keeps this idempotent against the uq_roles_name unique key.
INSERT IGNORE INTO `roles` (`name`, `label`, `description`, `is_system`) VALUES
  ('operations', 'Operations', 'Restricted admin access — modules granted individually per account', 1),
  ('sales', 'Sales', 'Restricted admin access — modules granted individually per account', 1);

-- Idempotent column additions for existing databases — see companies/events above.
ALTER TABLE `companies`
  ADD COLUMN IF NOT EXISTS `msme_registration_number` varchar(50) DEFAULT NULL COMMENT 'e.g. UDYAM-DL-09-0002610 — captured once, reused on every generated invoice for this company.' AFTER `email`,
  ADD COLUMN IF NOT EXISTS `gst_state_code` varchar(2) DEFAULT NULL COMMENT 'GST state code, e.g. "33" for Tamil Nadu — combined with `state` for invoice display as "Tamil Nadu-33".' AFTER `msme_registration_number`;

ALTER TABLE `events`
  ADD COLUMN IF NOT EXISTS `short_code` varchar(10) DEFAULT NULL COMMENT 'e.g. "CI" for Convergence India — used in generated document numbers like CI/26-27/P/38.' AFTER `edition`;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

