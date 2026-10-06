ALTER TABLE `Market`
  ADD COLUMN `lastPriceProvider` VARCHAR(64) NULL;

ALTER TABLE `Trade`
  ADD COLUMN `entryProvider` VARCHAR(64) NULL,
  ADD COLUMN `entryTimestamp` DATETIME(3) NULL;

ALTER TABLE `Settlement`
  ADD COLUMN `entryPrice` DECIMAL(30, 12) NULL,
  ADD COLUMN `entryProvider` VARCHAR(64) NULL,
  ADD COLUMN `entryTimestamp` DATETIME(3) NULL,
  ADD COLUMN `settlementProvider` VARCHAR(64) NULL,
  ADD COLUMN `settlementTimestamp` DATETIME(3) NULL;
