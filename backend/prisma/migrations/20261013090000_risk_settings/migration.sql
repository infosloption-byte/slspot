CREATE TABLE `RiskSettings` (
  `id` VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
  `minTradeAmount` DECIMAL(30, 8) NOT NULL DEFAULT 1,
  `maxTradeAmount` DECIMAL(30, 8) NOT NULL DEFAULT 100,
  `maxUserOpenExposure` DECIMAL(30, 8) NOT NULL DEFAULT 500,
  `maxUserOpenPositions` INTEGER NOT NULL DEFAULT 10,
  `maxPlatformOpenProfit` DECIMAL(30, 8) NOT NULL DEFAULT 2000,
  `maxAssetOpenProfit` DECIMAL(30, 8) NOT NULL DEFAULT 1000,
  `maxDirectionOpenProfit` DECIMAL(30, 8) NOT NULL DEFAULT 600,
  `payoutRates` JSON NULL,
  `restrictedCountries` JSON NULL,
  `alertKycReviewHours` INTEGER NOT NULL DEFAULT 24,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the single settings row with the launch defaults so the row lock in the trade transaction always has a row to lock.
INSERT INTO `RiskSettings` (`id`, `restrictedCountries`, `updatedAt`)
VALUES (
  'GLOBAL',
  JSON_ARRAY('US','CA','KP','CH','IL','NZ','AU','PR','SG','ID','RU','IR','YE','NL','DE','FR','ES','PT','GR','IT','SE','IS'),
  CURRENT_TIMESTAMP(3)
);
