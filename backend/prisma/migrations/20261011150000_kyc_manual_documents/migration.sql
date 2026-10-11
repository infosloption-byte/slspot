-- Manual KYC: encrypted document metadata, hosted-flow link and retention timestamp. Conditional so it converges on partially migrated databases.

SET @slspot_kyc_flowUrl_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'KycCase' AND column_name = 'flowUrl');
SET @slspot_kyc_flowUrl_sql = IF(@slspot_kyc_flowUrl_exists = 0, 'ALTER TABLE `KycCase` ADD COLUMN `flowUrl` VARCHAR(512) NULL', 'SELECT 1');
PREPARE slspot_kyc_flowUrl_stmt FROM @slspot_kyc_flowUrl_sql;
EXECUTE slspot_kyc_flowUrl_stmt;
DEALLOCATE PREPARE slspot_kyc_flowUrl_stmt;

SET @slspot_kyc_purge_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'KycCase' AND column_name = 'documentsPurgeAt');
SET @slspot_kyc_purge_sql = IF(@slspot_kyc_purge_exists = 0, 'ALTER TABLE `KycCase` ADD COLUMN `documentsPurgeAt` DATETIME(3) NULL', 'SELECT 1');
PREPARE slspot_kyc_purge_stmt FROM @slspot_kyc_purge_sql;
EXECUTE slspot_kyc_purge_stmt;
DEALLOCATE PREPARE slspot_kyc_purge_stmt;

SET @slspot_kyc_purge_idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'KycCase' AND index_name = 'KycCase_documentsPurgeAt_idx');
SET @slspot_kyc_purge_idx_sql = IF(@slspot_kyc_purge_idx_exists = 0, 'CREATE INDEX `KycCase_documentsPurgeAt_idx` ON `KycCase`(`documentsPurgeAt`)', 'SELECT 1');
PREPARE slspot_kyc_purge_idx_stmt FROM @slspot_kyc_purge_idx_sql;
EXECUTE slspot_kyc_purge_idx_stmt;
DEALLOCATE PREPARE slspot_kyc_purge_idx_stmt;

CREATE TABLE IF NOT EXISTS `KycDocument` (
  `id` CHAR(36) NOT NULL,
  `caseId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `storageKey` CHAR(32) NOT NULL,
  `mimeType` VARCHAR(32) NOT NULL,
  `sizeBytes` INTEGER NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `KycDocument_storageKey_key`(`storageKey`),
  UNIQUE INDEX `KycDocument_caseId_kind_key`(`caseId`, `kind`),
  INDEX `KycDocument_userId_idx`(`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `KycDocument_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `KycCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
