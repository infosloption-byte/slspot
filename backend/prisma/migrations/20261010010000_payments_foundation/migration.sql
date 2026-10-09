ALTER TABLE `User`
  ADD COLUMN `legalName` VARCHAR(160) NULL,
  ADD COLUMN `dateOfBirth` DATE NULL;

ALTER TABLE `Deposit`
  ADD COLUMN `idempotencyKey` VARCHAR(128) NULL,
  ADD COLUMN `expiresAt` DATETIME(3) NULL,
  ADD COLUMN `details` JSON NULL;

CREATE UNIQUE INDEX `Deposit_idempotencyKey_key` ON `Deposit`(`idempotencyKey`);

ALTER TABLE `Withdrawal`
  ADD COLUMN `idempotencyKey` VARCHAR(128) NULL,
  ADD COLUMN `details` JSON NULL,
  ADD COLUMN `reviewReason` VARCHAR(255) NULL,
  ADD COLUMN `reviewedByUserId` CHAR(36) NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `refundWalletTransactionId` CHAR(36) NULL;

CREATE UNIQUE INDEX `Withdrawal_idempotencyKey_key` ON `Withdrawal`(`idempotencyKey`);
CREATE UNIQUE INDEX `Withdrawal_refundWalletTransactionId_key` ON `Withdrawal`(`refundWalletTransactionId`);

CREATE TABLE `PaymentProviderConfig` (
  `id` VARCHAR(32) NOT NULL,
  `displayName` VARCHAR(80) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `depositEnabled` BOOLEAN NOT NULL DEFAULT true,
  `withdrawalEnabled` BOOLEAN NOT NULL DEFAULT true,
  `minDeposit` DECIMAL(30, 8) NOT NULL,
  `maxDeposit` DECIMAL(30, 8) NULL,
  `minWithdrawal` DECIMAL(30, 8) NOT NULL,
  `maxWithdrawal` DECIMAL(30, 8) NULL,
  `allowedCountries` JSON NULL,
  `blockedCountries` JSON NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 100,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaymentEvent` (
  `id` CHAR(36) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `eventId` VARCHAR(128) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `providerReference` VARCHAR(128) NULL,
  `payload` JSON NOT NULL,
  `processedAt` DATETIME(3) NULL,
  `error` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `PaymentEvent_provider_eventId_key`(`provider`, `eventId`),
  INDEX `PaymentEvent_provider_createdAt_idx`(`provider`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
