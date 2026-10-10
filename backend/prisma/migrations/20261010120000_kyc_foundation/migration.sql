-- KYC foundation: case decision fields and a webhook replay guard. Conditional so it converges on partially migrated databases.

SET @slspot_kyc_documentType_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'KycCase' AND column_name = 'documentType');
SET @slspot_kyc_documentType_sql = IF(@slspot_kyc_documentType_exists = 0, 'ALTER TABLE `KycCase` ADD COLUMN `documentType` VARCHAR(32) NULL', 'SELECT 1');
PREPARE slspot_kyc_documentType_stmt FROM @slspot_kyc_documentType_sql;
EXECUTE slspot_kyc_documentType_stmt;
DEALLOCATE PREPARE slspot_kyc_documentType_stmt;

SET @slspot_kyc_decisionReason_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'KycCase' AND column_name = 'decisionReason');
SET @slspot_kyc_decisionReason_sql = IF(@slspot_kyc_decisionReason_exists = 0, 'ALTER TABLE `KycCase` ADD COLUMN `decisionReason` VARCHAR(255) NULL', 'SELECT 1');
PREPARE slspot_kyc_decisionReason_stmt FROM @slspot_kyc_decisionReason_sql;
EXECUTE slspot_kyc_decisionReason_stmt;
DEALLOCATE PREPARE slspot_kyc_decisionReason_stmt;

SET @slspot_kyc_reviewedByUserId_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'KycCase' AND column_name = 'reviewedByUserId');
SET @slspot_kyc_reviewedByUserId_sql = IF(@slspot_kyc_reviewedByUserId_exists = 0, 'ALTER TABLE `KycCase` ADD COLUMN `reviewedByUserId` CHAR(36) NULL', 'SELECT 1');
PREPARE slspot_kyc_reviewedByUserId_stmt FROM @slspot_kyc_reviewedByUserId_sql;
EXECUTE slspot_kyc_reviewedByUserId_stmt;
DEALLOCATE PREPARE slspot_kyc_reviewedByUserId_stmt;

CREATE TABLE IF NOT EXISTS `KycEvent` (
  `id` CHAR(36) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `eventId` VARCHAR(128) NOT NULL,
  `providerCaseId` VARCHAR(128) NULL,
  `outcome` VARCHAR(32) NOT NULL,
  `payload` JSON NOT NULL,
  `processedAt` DATETIME(3) NULL,
  `error` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `KycEvent_provider_eventId_key`(`provider`, `eventId`),
  INDEX `KycEvent_provider_createdAt_idx`(`provider`, `createdAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
