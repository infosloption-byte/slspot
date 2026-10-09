-- Recovery helper for a database where
-- 20261008183000_account_support_announcements failed while adding the Notification
-- announcement foreign key.
--
-- Run this against the affected database (normally `slspot`) after confirming that
-- SystemAnnouncement exists. This script does not modify _prisma_migrations.
-- After it completes successfully, run:
--   npx prisma --config prisma7.config.ts migrate resolve --applied 20261008183000_account_support_announcements
--   npm run prisma:migrate:deploy
--
-- This helper checks existing objects so it can safely be re-run if interrupted.
DROP PROCEDURE IF EXISTS `slspot_repair_account_support_announcements`;

DELIMITER $$
CREATE PROCEDURE `slspot_repair_account_support_announcements`()
BEGIN
  DECLARE v_table_count INT DEFAULT 0;
  DECLARE v_column_count INT DEFAULT 0;
  DECLARE v_index_count INT DEFAULT 0;
  DECLARE v_fk_count INT DEFAULT 0;
  DECLARE v_invalid_count INT DEFAULT 0;
  DECLARE v_existing_fk VARCHAR(64);
  DECLARE v_sql TEXT;

  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'Notification';

  IF v_table_count = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Recovery stopped: Notification table does not exist in the selected database.';
  END IF;

  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'SystemAnnouncement';

  IF v_table_count = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Recovery stopped: SystemAnnouncement table does not exist; inspect the migration before continuing.';
  END IF;

  SELECT COUNT(*) INTO v_column_count
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'Notification'
    AND column_name = 'announcementId';

  IF v_column_count = 0 THEN
    ALTER TABLE `Notification`
      ADD COLUMN `announcementId` CHAR(36) NULL;
  ELSE
    -- Avoid silently truncating unexpected data when normalizing the FK column.
    SET @slspot_invalid_announcement_ids = 0;
    SET @slspot_recovery_sql =
      'SELECT COUNT(*) INTO @slspot_invalid_announcement_ids FROM `Notification` WHERE `announcementId` IS NOT NULL AND CHAR_LENGTH(`announcementId`) <> 36';
    PREPARE slspot_recovery_stmt FROM @slspot_recovery_sql;
    EXECUTE slspot_recovery_stmt;
    DEALLOCATE PREPARE slspot_recovery_stmt;

    SET v_invalid_count = COALESCE(@slspot_invalid_announcement_ids, 0);
    IF v_invalid_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Recovery stopped: Notification.announcementId contains non-36-character values; inspect them before changing the column type.';
    END IF;

    ALTER TABLE `Notification`
      MODIFY COLUMN `announcementId` CHAR(36) NULL;
  END IF;

  SELECT COUNT(*) INTO v_index_count
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'Notification'
    AND index_name = 'Notification_announcementId_idx';

  IF v_index_count = 0 THEN
    ALTER TABLE `Notification`
      ADD INDEX `Notification_announcementId_idx` (`announcementId`);
  END IF;

  -- Reuse an equivalent existing FK if present. If it has a different name,
  -- rename it safely by dropping and recreating it with Prisma's expected name.
  SELECT COUNT(*) INTO v_fk_count
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE()
    AND table_name = 'Notification'
    AND column_name = 'announcementId'
    AND referenced_table_name = 'SystemAnnouncement'
    AND referenced_column_name = 'id';

  IF v_fk_count > 0 THEN
    SELECT constraint_name INTO v_existing_fk
    FROM information_schema.key_column_usage
    WHERE constraint_schema = DATABASE()
      AND table_name = 'Notification'
      AND column_name = 'announcementId'
      AND referenced_table_name = 'SystemAnnouncement'
      AND referenced_column_name = 'id'
    LIMIT 1;

    IF v_existing_fk <> 'Notification_announcementId_fkey' THEN
      SET v_sql = CONCAT(
        'ALTER TABLE `Notification` DROP FOREIGN KEY `',
        REPLACE(v_existing_fk, '`', '``'),
        '`'
      );
      SET @slspot_recovery_sql = v_sql;
      PREPARE slspot_recovery_stmt FROM @slspot_recovery_sql;
      EXECUTE slspot_recovery_stmt;
      DEALLOCATE PREPARE slspot_recovery_stmt;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_fk_count
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'Notification'
    AND constraint_name = 'Notification_announcementId_fkey'
    AND constraint_type = 'FOREIGN KEY';

  IF v_fk_count = 0 THEN
    ALTER TABLE `Notification`
      ADD CONSTRAINT `Notification_announcementId_fkey`
      FOREIGN KEY (`announcementId`)
      REFERENCES `SystemAnnouncement`(`id`)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END$$
DELIMITER ;

CALL `slspot_repair_account_support_announcements`();
DROP PROCEDURE IF EXISTS `slspot_repair_account_support_announcements`;
