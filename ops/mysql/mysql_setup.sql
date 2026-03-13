-- Amazon Reviews Scraper / Dashboard
-- MySQL bootstrap script for cloud / DevOps teams
--
-- What this script does:
-- 1. Creates the application database
-- 2. Creates dedicated application users for remote and localhost access
-- 3. Grants app access on that database
-- 4. Creates all tables required by the current codebase
-- 5. Seeds the single pipeline status row expected by the app
--
-- Before running:
-- - This file is aligned to the current app env contract:
--     DB_HOST=...
--     DB_USER=llm_reader
--     DB_PASSWORD=...
--     DB_NAME=world
-- - Replace the password placeholder below before execution
-- - Review the host restriction for the app user
-- - Run with an admin account that can CREATE DATABASE / USER / GRANT
--
-- Tested target: MySQL 8.x
-- Minimum practical version: MySQL 5.7+ (JSON columns required)

-- =========================================================
-- 1. Replace these placeholders before execution
-- =========================================================
-- Database name: world
-- App user: llm_reader
-- App password: REPLACE_WITH_STRONG_PASSWORD
-- Remote app host:
--   '%'               = any host
--   '10.%'            = private network example
--   '1.2.3.4'         = single IP example
--   'render.com' etc. = not valid for MySQL grants unless resolved to host/IP rules by your provider
-- Local app host:
--   'localhost'       = local Windows / dev-machine access

-- =========================================================
-- 2. Database and user
-- =========================================================
CREATE DATABASE IF NOT EXISTS `world`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Remote / hosted app user
CREATE USER IF NOT EXISTS 'llm_reader'@'%'
  IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';

ALTER USER 'llm_reader'@'%'
  IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX
ON `world`.*
TO 'llm_reader'@'%';

-- Local machine app user
CREATE USER IF NOT EXISTS 'llm_reader'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';

ALTER USER 'llm_reader'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX
ON `world`.*
TO 'llm_reader'@'localhost';

USE `world`;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =========================================================
-- 3. Tables used by the application
-- =========================================================

CREATE TABLE IF NOT EXISTS `raw_reviews` (
  `review_id` VARCHAR(64) NOT NULL,
  `asin` VARCHAR(20) NOT NULL,
  `product_name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(255) DEFAULT NULL,
  `rating` VARCHAR(32) DEFAULT NULL,
  `title` TEXT,
  `review` LONGTEXT,
  `review_date` VARCHAR(255) DEFAULT NULL,
  `review_url` TEXT,
  `scrape_date` DATE NOT NULL,
  PRIMARY KEY (`review_id`),
  KEY `idx_raw_reviews_asin` (`asin`),
  KEY `idx_raw_reviews_product_name` (`product_name`),
  KEY `idx_raw_reviews_category` (`category`),
  KEY `idx_raw_reviews_scrape_date` (`scrape_date`),
  KEY `idx_raw_reviews_asin_scrape_date` (`asin`, `scrape_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `review_tags` (
  `review_id` VARCHAR(64) NOT NULL,
  `asin` VARCHAR(20) NOT NULL,
  `sentiment` VARCHAR(20) DEFAULT NULL,
  `primary_categories` JSON DEFAULT NULL,
  `sub_tags` JSON DEFAULT NULL,
  PRIMARY KEY (`review_id`),
  KEY `idx_review_tags_asin` (`asin`),
  KEY `idx_review_tags_sentiment` (`sentiment`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pipeline_runs` (
  `id` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'IDLE',
  `message` TEXT,
  `started_at` DATETIME DEFAULT NULL,
  `finished_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pipeline_jobs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `days` INT NOT NULL,
  `asins_json` JSON DEFAULT NULL,
  `requested_via` VARCHAR(32) NOT NULL DEFAULT 'ui',
  `requested_by` VARCHAR(255) DEFAULT NULL,
  `worker_id` VARCHAR(255) DEFAULT NULL,
  `message` TEXT,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `claimed_at` DATETIME DEFAULT NULL,
  `started_at` DATETIME DEFAULT NULL,
  `finished_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pipeline_jobs_status_created` (`status`, `created_at`),
  KEY `idx_pipeline_jobs_worker` (`worker_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pipeline_workers` (
  `worker_id` VARCHAR(255) NOT NULL,
  `host_name` VARCHAR(255) DEFAULT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'IDLE',
  `message` TEXT,
  `capabilities_json` JSON DEFAULT NULL,
  `last_heartbeat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`worker_id`),
  KEY `idx_pipeline_workers_last_heartbeat` (`last_heartbeat`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_summaries` (
  `asin` VARCHAR(20) NOT NULL,
  `issues` JSON DEFAULT NULL,
  `positives` JSON DEFAULT NULL,
  `generated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`asin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_ratings_snapshot` (
  `asin` VARCHAR(20) NOT NULL,
  `product_name` VARCHAR(255) NOT NULL,
  `scraped_date` DATE NOT NULL,
  `overall_rating` DECIMAL(3,2) DEFAULT NULL,
  `total_ratings` INT DEFAULT NULL,
  PRIMARY KEY (`asin`, `scraped_date`),
  KEY `idx_product_ratings_snapshot_product_name` (`product_name`),
  KEY `idx_product_ratings_snapshot_scraped_date` (`scraped_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 4. Seed data required by the app
-- =========================================================

INSERT IGNORE INTO `pipeline_runs` (`id`, `status`, `message`, `started_at`, `finished_at`)
VALUES (1, 'IDLE', 'Ready', NULL, NULL);

FLUSH PRIVILEGES;

-- =========================================================
-- 5. Optional notes for cloud team
-- =========================================================
-- Recommended environment variables for the app:
--   DB_HOST=<managed-mysql-host>
--   DB_NAME=world
--   DB_USER=llm_reader
--   DB_PASSWORD=<same strong password>
--   For local Windows MySQL, the same user is also created at 'localhost'
--
-- Operational notes:
-- - Do not change raw_reviews.rating to DECIMAL. The app stores the raw Amazon text there.
-- - JSON column support is required.
-- - review_tags.review_id is expected to match raw_reviews.review_id one-to-one.
-- - product_ratings_snapshot stores one row per ASIN per scraped_date.
-- - pipeline_jobs and pipeline_workers are used by the optional Windows worker model.

-- =========================================================
-- 6. Privilege repair block for existing environments
-- =========================================================
-- If llm_reader already exists and worker-mode pages show permission errors,
-- run this block again with an admin account:
--
-- USE `world`;
--
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX
-- ON `world`.* TO 'llm_reader'@'%';
--
-- FLUSH PRIVILEGES;
--
-- If your MySQL setup uses a local-only account instead of '%', run:
--
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX
-- ON `world`.* TO 'llm_reader'@'localhost';
--
-- FLUSH PRIVILEGES;
