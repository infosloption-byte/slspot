-- Repair the Notification -> SystemAnnouncement relationship when an older database
-- recorded 20261008183000_account_support_announcements as applied before all DDL
-- completed. This migration is safe on fresh databases where the objects already exist.
--
-- Use prepared statements for conditional DDL; avoid client-only DELIMITER directives
-- and stored procedures so Prisma can execute this file as a regular migration.

SET @slspot_announcement_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'Notification'
    AND column_name = 'announcementId'
);

SET @slspot_announcement_column_sql = IF(
  @slspot_announcement_column_exists = 0,
  'ALTER TABLE `Notification` ADD COLUMN `announcementId` CHAR(36) NULL',
  'SET @slspot_migration_noop = 1'
);

PREPARE slspot_announcement_column_stmt FROM @slspot_announcement_column_sql;
EXECUTE slspot_announcement_column_stmt;
DEALLOCATE PREPARE slspot_announcement_column_stmt;

SET @slspot_announcement_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'Notification'
    AND index_name = 'Notification_announcementId_idx'
);

SET @slspot_announcement_index_sql = IF(
  @slspot_announcement_index_exists = 0,
  'ALTER TABLE `Notification` ADD INDEX `Notification_announcementId_idx` (`announcementId`)',
  'SET @slspot_migration_noop = 1'
);

PREPARE slspot_announcement_index_stmt FROM @slspot_announcement_index_sql;
EXECUTE slspot_announcement_index_stmt;
DEALLOCATE PREPARE slspot_announcement_index_stmt;

-- Check for the expected FK definition, not just its name.
SET @slspot_expected_announcement_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE()
    AND table_name = 'Notification'
    AND constraint_name = 'Notification_announcementId_fkey'
    AND column_name = 'announcementId'
    AND referenced_table_name = 'SystemAnnouncement'
    AND referenced_column_name = 'id'
);

-- If the expected name is occupied by a different FK definition, remove it
-- before restoring the expected relationship.
SET @slspot_expected_announcement_fk_name_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'Notification'
    AND constraint_name = 'Notification_announcementId_fkey'
    AND constraint_type = 'FOREIGN KEY'
);

SET @slspot_drop_expected_announcement_fk_sql = IF(
  @slspot_expected_announcement_fk_exists = 0
    AND @slspot_expected_announcement_fk_name_exists > 0,
  'ALTER TABLE `Notification` DROP FOREIGN KEY `Notification_announcementId_fkey`',
  'SET @slspot_migration_noop = 1'
);

PREPARE slspot_drop_expected_announcement_fk_stmt FROM @slspot_drop_expected_announcement_fk_sql;
EXECUTE slspot_drop_expected_announcement_fk_stmt;
DEALLOCATE PREPARE slspot_drop_expected_announcement_fk_stmt;

-- Normalize an equivalent relationship if it exists under a non-Prisma name,
-- so the migration leaves just the expected foreign-key name.
SET @slspot_other_announcement_fk_name = (
  SELECT MIN(constraint_name)
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE()
    AND table_name = 'Notification'
    AND column_name = 'announcementId'
    AND referenced_table_name = 'SystemAnnouncement'
    AND referenced_column_name = 'id'
    AND constraint_name <> 'Notification_announcementId_fkey'
);

SET @slspot_drop_other_announcement_fk_sql = IF(
  @slspot_expected_announcement_fk_exists = 0
    AND @slspot_other_announcement_fk_name IS NOT NULL,
  CONCAT(
    'ALTER TABLE `Notification` DROP FOREIGN KEY `',
    REPLACE(@slspot_other_announcement_fk_name, '`', '``'),
    '`'
  ),
  'SET @slspot_migration_noop = 1'
);

PREPARE slspot_drop_other_announcement_fk_stmt FROM @slspot_drop_other_announcement_fk_sql;
EXECUTE slspot_drop_other_announcement_fk_stmt;
DEALLOCATE PREPARE slspot_drop_other_announcement_fk_stmt;

SET @slspot_announcement_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE()
    AND table_name = 'Notification'
    AND constraint_name = 'Notification_announcementId_fkey'
    AND column_name = 'announcementId'
    AND referenced_table_name = 'SystemAnnouncement'
    AND referenced_column_name = 'id'
);

SET @slspot_announcement_fk_sql = IF(
  @slspot_announcement_fk_exists = 0,
  'ALTER TABLE `Notification` ADD CONSTRAINT `Notification_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `SystemAnnouncement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SET @slspot_migration_noop = 1'
);

PREPARE slspot_announcement_fk_stmt FROM @slspot_announcement_fk_sql;
EXECUTE slspot_announcement_fk_stmt;
DEALLOCATE PREPARE slspot_announcement_fk_stmt;
