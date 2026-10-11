UPDATE `User`
SET `locale` = 'en-US'
WHERE `locale` IS NULL OR `locale` <> 'en-US';

ALTER TABLE `User`
  MODIFY `locale` VARCHAR(35) NULL DEFAULT 'en-US';
