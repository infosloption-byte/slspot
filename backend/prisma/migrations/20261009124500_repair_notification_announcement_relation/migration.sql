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

-- A pre-existing Notification table can have a different default collation
-- from SystemAnnouncement. MySQL requires matching character set/collation for
-- string columns used in a foreign key, even when both columns are CHAR(36).
-- Copy the referenced primary-key column's metadata rather than assuming a
-- server/database default.
SET @slspot_announcement_id_charset = (
  SELECT character_set_name
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'SystemAnnouncement'
    AND column_name = 'id'
  LIMIT 1
);

SET @slspot_announcement_id_collation = (
  SELECT collation_name
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'SystemAnnouncement'
    AND column_name = 'id'
  LIMIT 1
);

SET @slspot_normalize_announcement_column_sql = IF(
  @slspot_announcement_id_charset IS NOT NULL
    AND @slspot_announcement_id_collation IS NOT NULL,
  CONCAT(
    'ALTER TABLE `Notification` MODIFY COLUMN `announcementId` CHAR(36) CHARACTER SET ',
    @slspot_announcement_id_charset,
    ' COLLATE ',
    @slspot_announcement_id_collation,
    ' NULL'
  ),
  'SELECT 1'
);

PREPARE slspot_normalize_announcement_column_stmt FROM @slspot_normalize_announcement_column_sql;
EXECUTE slspot_normalize_announcement_column_stmt;
DEALLOCATE PREPARE slspot_normalize_announcement_column_stmt;

-- Both sides of a MySQL foreign key must use a supporting storage engine.
-- Normalize only if an existing database has drifted from the migration schema.
SET @slspot_notification_engine = (
  SELECT engine FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'Notification'
  LIMIT 1
);
SET @slspot_announcement_engine = (
  SELECT engine FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'SystemAnnouncement'
  LIMIT 1
);

SET @slspot_notification_engine_sql = IF(
  @slspot_notification_engine IS NOT NULL
    AND UPPER(@slspot_notification_engine) <> 'INNODB',
  'ALTER TABLE `Notification` ENGINE=InnoDB',
  'SELECT 1'
);
PREPARE slspot_notification_engine_stmt FROM @slspot_notification_engine_sql;
EXECUTE slspot_notification_engine_stmt;
DEALLOCATE PREPARE slspot_notification_engine_stmt;

SET @slspot_announcement_engine_sql = IF(
  @slspot_announcement_engine IS NOT NULL
    AND UPPER(@slspot_announcement_engine) <> 'INNODB',
  'ALTER TABLE `SystemAnnouncement` ENGINE=InnoDB',
  'SELECT 1'
);
PREPARE slspot_announcement_engine_stmt FROM @slspot_announcement_engine_sql;
EXECUTE slspot_announcement_engine_stmt;
DEALLOCATE PREPARE slspot_announcement_engine_stmt;

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
