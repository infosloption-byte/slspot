CREATE TABLE `RealMoneyGate` (
  `id` VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
  `tradingEnabled` BOOLEAN NOT NULL DEFAULT false,
  `depositsEnabled` BOOLEAN NOT NULL DEFAULT false,
  `withdrawalsEnabled` BOOLEAN NOT NULL DEFAULT false,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
