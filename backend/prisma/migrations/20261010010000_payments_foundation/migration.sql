-- Idempotent payment foundation migration.

-- The earlier 20261009120000_payments_foundation migration may already have

-- created some or all of these objects in a development database. Conditional

-- DDL permits a clean database and an existing database to converge safely.

SET @slspot_payments_user_legal_name_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'User' AND column_name = 'legalName');
SET @slspot_payments_user_legal_name_sql = IF(@slspot_payments_user_legal_name_exists = 0, 'ALTER TABLE `User` ADD COLUMN `legalName` VARCHAR(160) NULL', 'SELECT 1');
PREPARE slspot_payments_user_legal_name_stmt FROM @slspot_payments_user_legal_name_sql;
EXECUTE slspot_payments_user_legal_name_stmt;
DEALLOCATE PREPARE slspot_payments_user_legal_name_stmt;

SET @slspot_payments_user_dob_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'User' AND column_name = 'dateOfBirth');
SET @slspot_payments_user_dob_sql = IF(@slspot_payments_user_dob_exists = 0, 'ALTER TABLE `User` ADD COLUMN `dateOfBirth` DATE NULL', 'SELECT 1');
PREPARE slspot_payments_user_dob_stmt FROM @slspot_payments_user_dob_sql;
EXECUTE slspot_payments_user_dob_stmt;
DEALLOCATE PREPARE slspot_payments_user_dob_stmt;

SET @slspot_payments_deposit_idempotency_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Deposit' AND column_name = 'idempotencyKey');
SET @slspot_payments_deposit_idempotency_sql = IF(@slspot_payments_deposit_idempotency_exists = 0, 'ALTER TABLE `Deposit` ADD COLUMN `idempotencyKey` VARCHAR(128) NULL', 'SELECT 1');
PREPARE slspot_payments_deposit_idempotency_stmt FROM @slspot_payments_deposit_idempotency_sql;
EXECUTE slspot_payments_deposit_idempotency_stmt;
DEALLOCATE PREPARE slspot_payments_deposit_idempotency_stmt;

SET @slspot_payments_deposit_expiry_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Deposit' AND column_name = 'expiresAt');
SET @slspot_payments_deposit_expiry_sql = IF(@slspot_payments_deposit_expiry_exists = 0, 'ALTER TABLE `Deposit` ADD COLUMN `expiresAt` DATETIME(3) NULL', 'SELECT 1');
PREPARE slspot_payments_deposit_expiry_stmt FROM @slspot_payments_deposit_expiry_sql;
EXECUTE slspot_payments_deposit_expiry_stmt;
DEALLOCATE PREPARE slspot_payments_deposit_expiry_stmt;

SET @slspot_payments_deposit_details_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Deposit' AND column_name = 'details');
SET @slspot_payments_deposit_details_sql = IF(@slspot_payments_deposit_details_exists = 0, 'ALTER TABLE `Deposit` ADD COLUMN `details` JSON NULL', 'SELECT 1');
PREPARE slspot_payments_deposit_details_stmt FROM @slspot_payments_deposit_details_sql;
EXECUTE slspot_payments_deposit_details_stmt;
DEALLOCATE PREPARE slspot_payments_deposit_details_stmt;

SET @slspot_payments_withdrawal_idempotency_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Withdrawal' AND column_name = 'idempotencyKey');
SET @slspot_payments_withdrawal_idempotency_sql = IF(@slspot_payments_withdrawal_idempotency_exists = 0, 'ALTER TABLE `Withdrawal` ADD COLUMN `idempotencyKey` VARCHAR(128) NULL', 'SELECT 1');
PREPARE slspot_payments_withdrawal_idempotency_stmt FROM @slspot_payments_withdrawal_idempotency_sql;
EXECUTE slspot_payments_withdrawal_idempotency_stmt;
DEALLOCATE PREPARE slspot_payments_withdrawal_idempotency_stmt;

SET @slspot_payments_withdrawal_details_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Withdrawal' AND column_name = 'details');
SET @slspot_payments_withdrawal_details_sql = IF(@slspot_payments_withdrawal_details_exists = 0, 'ALTER TABLE `Withdrawal` ADD COLUMN `details` JSON NULL', 'SELECT 1');
PREPARE slspot_payments_withdrawal_details_stmt FROM @slspot_payments_withdrawal_details_sql;
EXECUTE slspot_payments_withdrawal_details_stmt;
DEALLOCATE PREPARE slspot_payments_withdrawal_details_stmt;

SET @slspot_payments_withdrawal_review_reason_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Withdrawal' AND column_name = 'reviewReason');
SET @slspot_payments_withdrawal_review_reason_sql = IF(@slspot_payments_withdrawal_review_reason_exists = 0, 'ALTER TABLE `Withdrawal` ADD COLUMN `reviewReason` VARCHAR(255) NULL', 'SELECT 1');
PREPARE slspot_payments_withdrawal_review_reason_stmt FROM @slspot_payments_withdrawal_review_reason_sql;
EXECUTE slspot_payments_withdrawal_review_reason_stmt;
DEALLOCATE PREPARE slspot_payments_withdrawal_review_reason_stmt;

SET @slspot_payments_withdrawal_reviewed_by_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Withdrawal' AND column_name = 'reviewedByUserId');
SET @slspot_payments_withdrawal_reviewed_by_sql = IF(@slspot_payments_withdrawal_reviewed_by_exists = 0, 'ALTER TABLE `Withdrawal` ADD COLUMN `reviewedByUserId` CHAR(36) NULL', 'SELECT 1');
PREPARE slspot_payments_withdrawal_reviewed_by_stmt FROM @slspot_payments_withdrawal_reviewed_by_sql;
EXECUTE slspot_payments_withdrawal_reviewed_by_stmt;
DEALLOCATE PREPARE slspot_payments_withdrawal_reviewed_by_stmt;

SET @slspot_payments_withdrawal_reviewed_at_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Withdrawal' AND column_name = 'reviewedAt');
SET @slspot_payments_withdrawal_reviewed_at_sql = IF(@slspot_payments_withdrawal_reviewed_at_exists = 0, 'ALTER TABLE `Withdrawal` ADD COLUMN `reviewedAt` DATETIME(3) NULL', 'SELECT 1');
PREPARE slspot_payments_withdrawal_reviewed_at_stmt FROM @slspot_payments_withdrawal_reviewed_at_sql;
EXECUTE slspot_payments_withdrawal_reviewed_at_stmt;
DEALLOCATE PREPARE slspot_payments_withdrawal_reviewed_at_stmt;

SET @slspot_payments_withdrawal_refund_tx_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Withdrawal' AND column_name = 'refundWalletTransactionId');
SET @slspot_payments_withdrawal_refund_tx_sql = IF(@slspot_payments_withdrawal_refund_tx_exists = 0, 'ALTER TABLE `Withdrawal` ADD COLUMN `refundWalletTransactionId` CHAR(36) NULL', 'SELECT 1');
PREPARE slspot_payments_withdrawal_refund_tx_stmt FROM @slspot_payments_withdrawal_refund_tx_sql;
EXECUTE slspot_payments_withdrawal_refund_tx_stmt;
DEALLOCATE PREPARE slspot_payments_withdrawal_refund_tx_stmt;

SET @slspot_payments_deposit_idempotency_idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'Deposit' AND index_name = 'Deposit_idempotencyKey_key');
SET @slspot_payments_deposit_idempotency_idx_sql = IF(@slspot_payments_deposit_idempotency_idx_exists = 0, 'CREATE UNIQUE INDEX `Deposit_idempotencyKey_key` ON `Deposit`(`idempotencyKey`)', 'SELECT 1');
PREPARE slspot_payments_deposit_idempotency_idx_stmt FROM @slspot_payments_deposit_idempotency_idx_sql;
EXECUTE slspot_payments_deposit_idempotency_idx_stmt;
DEALLOCATE PREPARE slspot_payments_deposit_idempotency_idx_stmt;

SET @slspot_payments_withdrawal_idempotency_idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'Withdrawal' AND index_name = 'Withdrawal_idempotencyKey_key');
SET @slspot_payments_withdrawal_idempotency_idx_sql = IF(@slspot_payments_withdrawal_idempotency_idx_exists = 0, 'CREATE UNIQUE INDEX `Withdrawal_idempotencyKey_key` ON `Withdrawal`(`idempotencyKey`)', 'SELECT 1');
PREPARE slspot_payments_withdrawal_idempotency_idx_stmt FROM @slspot_payments_withdrawal_idempotency_idx_sql;
EXECUTE slspot_payments_withdrawal_idempotency_idx_stmt;
DEALLOCATE PREPARE slspot_payments_withdrawal_idempotency_idx_stmt;

SET @slspot_payments_withdrawal_refund_tx_idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'Withdrawal' AND index_name = 'Withdrawal_refundWalletTransactionId_key');
SET @slspot_payments_withdrawal_refund_tx_idx_sql = IF(@slspot_payments_withdrawal_refund_tx_idx_exists = 0, 'CREATE UNIQUE INDEX `Withdrawal_refundWalletTransactionId_key` ON `Withdrawal`(`refundWalletTransactionId`)', 'SELECT 1');
PREPARE slspot_payments_withdrawal_refund_tx_idx_stmt FROM @slspot_payments_withdrawal_refund_tx_idx_sql;
EXECUTE slspot_payments_withdrawal_refund_tx_idx_stmt;
DEALLOCATE PREPARE slspot_payments_withdrawal_refund_tx_idx_stmt;

CREATE TABLE IF NOT EXISTS `PaymentProviderConfig` (
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
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PaymentEvent` (
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
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
