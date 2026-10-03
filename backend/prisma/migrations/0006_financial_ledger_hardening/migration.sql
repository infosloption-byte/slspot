-- Formal double-entry ledger hardening.
-- Existing one-sided LedgerEntry records are retained as LedgerEntryLegacy and
-- represented in the new ledger with an explicit migration-offset counter-entry.

RENAME TABLE `LedgerEntry` TO `LedgerEntryLegacy`;

CREATE TABLE `LedgerAccount` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(96) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `type` ENUM('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `accountId` CHAR(36) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `LedgerAccount_code_key`(`code`),
  INDEX `LedgerAccount_accountId_active_idx`(`accountId`,`active`),
  INDEX `LedgerAccount_type_currency_active_idx`(`type`,`currency`,`active`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LedgerTransaction` (
  `id` CHAR(36) NOT NULL,
  `walletTransactionId` CHAR(36) NULL,
  `currency` CHAR(3) NOT NULL,
  `referenceType` VARCHAR(64) NULL,
  `referenceId` VARCHAR(128) NULL,
  `description` VARCHAR(255) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `LedgerTransaction_walletTransactionId_key`(`walletTransactionId`),
  INDEX `LedgerTransaction_referenceType_referenceId_createdAt_idx`(`referenceType`,`referenceId`,`createdAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LedgerEntry` (
  `id` CHAR(36) NOT NULL,
  `ledgerTransactionId` CHAR(36) NOT NULL,
  `ledgerAccountId` CHAR(36) NOT NULL,
  `direction` ENUM('DEBIT','CREDIT') NOT NULL,
  `amount` DECIMAL(30,8) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `referenceType` VARCHAR(64) NULL,
  `referenceId` VARCHAR(128) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `LedgerEntry_ledgerTransactionId_idx`(`ledgerTransactionId`),
  INDEX `LedgerEntry_ledgerAccountId_createdAt_idx`(`ledgerAccountId`,`createdAt`),
  INDEX `LedgerEntry_referenceType_referenceId_idx`(`referenceType`,`referenceId`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LedgerBalanceSnapshot` (
  `id` CHAR(36) NOT NULL,
  `ledgerAccountId` CHAR(36) NOT NULL,
  `ledgerTransactionId` CHAR(36) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `balance` DECIMAL(30,8) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `LedgerBalanceSnapshot_ledgerAccountId_createdAt_idx`(`ledgerAccountId`,`createdAt`),
  INDEX `LedgerBalanceSnapshot_ledgerTransactionId_idx`(`ledgerTransactionId`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LedgerAccount`
  ADD CONSTRAINT `LedgerAccount_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LedgerTransaction`
  ADD CONSTRAINT `LedgerTransaction_walletTransactionId_fkey`
  FOREIGN KEY (`walletTransactionId`) REFERENCES `WalletTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LedgerEntry`
  ADD CONSTRAINT `LedgerEntry_ledgerTransactionId_fkey`
  FOREIGN KEY (`ledgerTransactionId`) REFERENCES `LedgerTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `LedgerEntry_ledgerAccountId_fkey`
  FOREIGN KEY (`ledgerAccountId`) REFERENCES `LedgerAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LedgerBalanceSnapshot`
  ADD CONSTRAINT `LedgerBalanceSnapshot_ledgerAccountId_fkey`
  FOREIGN KEY (`ledgerAccountId`) REFERENCES `LedgerAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `LedgerBalanceSnapshot_ledgerTransactionId_fkey`
  FOREIGN KEY (`ledgerTransactionId`) REFERENCES `LedgerTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `LedgerAccount` (`id`,`code`,`name`,`type`,`currency`,`accountId`,`active`,`createdAt`,`updatedAt`)
SELECT UUID(), CONCAT('USER:', a.id, ':AVAILABLE'), CONCAT(a.name, ' available balance'), 'LIABILITY', a.currency, a.id, true, a.createdAt, a.updatedAt
FROM `Account` a;

INSERT INTO `LedgerAccount` (`id`,`code`,`name`,`type`,`currency`,`accountId`,`active`,`createdAt`,`updatedAt`)
SELECT UUID(), CONCAT('USER:', a.id, ':HELD'), CONCAT(a.name, ' held balance'), 'LIABILITY', a.currency, a.id, true, a.createdAt, a.updatedAt
FROM `Account` a;

INSERT INTO `LedgerAccount` (`id`,`code`,`name`,`type`,`currency`,`accountId`,`active`,`createdAt`,`updatedAt`)
VALUES
  (UUID(), 'SYSTEM:DEMO_FUNDING:USD', 'Demo funding source', 'EQUITY', 'USD', NULL, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'SYSTEM:TRADE_FEES:USD', 'Trading fee revenue', 'REVENUE', 'USD', NULL, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'SYSTEM:TRADE_SETTLEMENT:USD', 'Trade settlement house result', 'EQUITY', 'USD', NULL, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'SYSTEM:DEMO_WITHDRAWAL:USD', 'Demo withdrawal clearing', 'ASSET', 'USD', NULL, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `LedgerTransaction` (`id`,`walletTransactionId`,`currency`,`referenceType`,`referenceId`,`description`,`createdAt`)
SELECT
  legacy.transactionId,
  MIN(legacy.walletTransactionId),
  MIN(legacy.currency),
  MIN(legacy.referenceType),
  MIN(legacy.referenceId),
  CONCAT('Legacy ledger migration for transaction ', legacy.transactionId),
  MIN(legacy.createdAt)
FROM `LedgerEntryLegacy` legacy
GROUP BY legacy.transactionId;

INSERT INTO `LedgerEntry` (`id`,`ledgerTransactionId`,`ledgerAccountId`,`direction`,`amount`,`currency`,`referenceType`,`referenceId`,`createdAt`)
SELECT
  legacy.id,
  legacy.transactionId,
  accountLedger.id,
  legacy.direction,
  legacy.amount,
  legacy.currency,
  legacy.referenceType,
  legacy.referenceId,
  legacy.createdAt
FROM `LedgerEntryLegacy` legacy
JOIN `LedgerAccount` accountLedger
  ON accountLedger.accountId = legacy.accountId
  AND accountLedger.code = CONCAT('USER:', legacy.accountId, ':AVAILABLE');

INSERT INTO `LedgerEntry` (`id`,`ledgerTransactionId`,`ledgerAccountId`,`direction`,`amount`,`currency`,`referenceType`,`referenceId`,`createdAt`)
SELECT
  UUID(),
  legacy.transactionId,
  systemLedger.id,
  CASE WHEN legacy.direction = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
  legacy.amount,
  legacy.currency,
  'LEGACY_OFFSET',
  legacy.id,
  legacy.createdAt
FROM `LedgerEntryLegacy` legacy
JOIN `LedgerAccount` systemLedger
  ON systemLedger.code = CONCAT('SYSTEM:TRADE_SETTLEMENT:', legacy.currency);

ALTER TABLE `WalletTransaction`
  ADD COLUMN `availableBalanceAfter` DECIMAL(30,8) NULL,
  ADD COLUMN `heldBalanceAfter` DECIMAL(30,8) NULL;

ALTER TABLE `Deposit`
  ADD COLUMN `walletTransactionId` CHAR(36) NULL,
  ADD UNIQUE INDEX `Deposit_walletTransactionId_key`(`walletTransactionId`);

ALTER TABLE `Withdrawal`
  ADD COLUMN `walletTransactionId` CHAR(36) NULL,
  ADD UNIQUE INDEX `Withdrawal_walletTransactionId_key`(`walletTransactionId`);

ALTER TABLE `Deposit`
  ADD CONSTRAINT `Deposit_walletTransactionId_fkey`
  FOREIGN KEY (`walletTransactionId`) REFERENCES `WalletTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Withdrawal`
  ADD CONSTRAINT `Withdrawal_walletTransactionId_fkey`
  FOREIGN KEY (`walletTransactionId`) REFERENCES `WalletTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER `ledger_entry_immutable_update`
BEFORE UPDATE ON `LedgerEntry`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger entries are immutable';

CREATE TRIGGER `ledger_entry_immutable_delete`
BEFORE DELETE ON `LedgerEntry`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger entries are immutable';

CREATE TRIGGER `ledger_transaction_immutable_update`
BEFORE UPDATE ON `LedgerTransaction`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger transactions are immutable';

CREATE TRIGGER `ledger_transaction_immutable_delete`
BEFORE DELETE ON `LedgerTransaction`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger transactions are immutable';

CREATE TRIGGER `ledger_snapshot_immutable_update`
BEFORE UPDATE ON `LedgerBalanceSnapshot`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger balance snapshots are immutable';

CREATE TRIGGER `ledger_snapshot_immutable_delete`
BEFORE DELETE ON `LedgerBalanceSnapshot`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger balance snapshots are immutable';
