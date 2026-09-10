-- Fixes the Registrations admin page (was 500ing on every load — its route
-- has always queried a `space_bookings` table that was never actually
-- created in this database). See schema.sql for full column notes.
--
-- Heads up: this makes the page LOAD correctly, but it will show an empty
-- list — nothing currently inserts into this table (no public "reserve your
-- space" enquiry form exists yet to feed it). Building that form is a
-- separate, larger piece of work if you want this page to have real data.
--
-- How to run:
--   mysql -u <user> -p <db_name> < migrations/2026-09-10_space_bookings.sql

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
