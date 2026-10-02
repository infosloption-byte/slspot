-- Initial SL Spot persistence schema
-- Prisma ORM 7 / MySQL

CREATE TABLE `User` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `status` ENUM('PENDING_VERIFICATION','ACTIVE','SUSPENDED','DISABLED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
  `countryCode` CHAR(2) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `lastLoginAt` DATETIME(3) NULL,
  UNIQUE INDEX `User_email_key`(`email`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Session` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
  INDEX `Session_userId_expiresAt_idx`(`userId`, `expiresAt`),
  INDEX `Session_userId_revokedAt_idx`(`userId`, `revokedAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Device` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `deviceName` VARCHAR(120) NULL,
  `fingerprintHash` VARCHAR(255) NULL,
  `userAgent` VARCHAR(512) NULL,
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Device_userId_revokedAt_idx`(`userId`, `revokedAt`),
  INDEX `Device_userId_lastSeenAt_idx`(`userId`, `lastSeenAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Account` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `status` ENUM('ACTIVE','SUSPENDED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Account_userId_currency_key`(`userId`, `currency`),
  INDEX `Account_userId_status_idx`(`userId`, `status`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Asset` (
  `id` CHAR(36) NOT NULL,
  `symbol` VARCHAR(32) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `type` ENUM('CRYPTO','FOREX','STOCK','COMMODITY','INDEX','OTHER') NOT NULL,
  `baseCurrency` CHAR(3) NULL,
  `quoteCurrency` CHAR(3) NULL,
  `priceScale` INT NOT NULL DEFAULT 8,
  `quantityScale` INT NOT NULL DEFAULT 8,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Asset_symbol_key`(`symbol`),
  INDEX `Asset_type_isActive_sortOrder_idx`(`type`, `isActive`, `sortOrder`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Market` (
  `id` CHAR(36) NOT NULL,
  `assetId` CHAR(36) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `externalSymbol` VARCHAR(127) NOT NULL,
  `status` ENUM('OPEN','CLOSED','HALTED','MAINTENANCE') NOT NULL DEFAULT 'CLOSED',
  `lastPrice` DECIMAL(30,12) NULL,
  `lastPriceAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Market_provider_externalSymbol_key`(`provider`, `externalSymbol`),
  INDEX `Market_assetId_status_idx`(`assetId`, `status`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Order` (
  `id` CHAR(36) NOT NULL,
  `clientRequestId` VARCHAR(128) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `assetId` CHAR(36) NOT NULL,
  `type` ENUM('MARKET','LIMIT') NOT NULL,
  `side` ENUM('BUY','SELL') NOT NULL,
  `status` ENUM('PENDING','ACCEPTED','REJECTED','CANCELLED','FAILED') NOT NULL DEFAULT 'PENDING',
  `amount` DECIMAL(30,8) NOT NULL,
  `requestedPrice` DECIMAL(30,12) NULL,
  `executedPrice` DECIMAL(30,12) NULL,
  `durationSeconds` INT NULL,
  `expiresAt` DATETIME(3) NULL,
  `fee` DECIMAL(30,8) NOT NULL DEFAULT 0,
  `rejectionReason` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `acceptedAt` DATETIME(3) NULL,
  UNIQUE INDEX `Order_clientRequestId_key`(`clientRequestId`),
  INDEX `Order_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `Order_accountId_status_createdAt_idx`(`accountId`, `status`, `createdAt`),
  INDEX `Order_assetId_status_createdAt_idx`(`assetId`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Position` (
  `id` CHAR(36) NOT NULL,
  `orderId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `assetId` CHAR(36) NOT NULL,
  `side` ENUM('BUY','SELL') NOT NULL,
  `status` ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  `amount` DECIMAL(30,8) NOT NULL,
  `entryPrice` DECIMAL(30,12) NOT NULL,
  `exitPrice` DECIMAL(30,12) NULL,
  `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `closedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Position_orderId_key`(`orderId`),
  INDEX `Position_userId_status_openedAt_idx`(`userId`, `status`, `openedAt`),
  INDEX `Position_accountId_status_openedAt_idx`(`accountId`, `status`, `openedAt`),
  INDEX `Position_assetId_status_openedAt_idx`(`assetId`, `status`, `openedAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Trade` (
  `id` CHAR(36) NOT NULL,
  `positionId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `status` ENUM('OPEN','WON','LOST','CANCELLED','EXPIRED') NOT NULL DEFAULT 'OPEN',
  `grossPnl` DECIMAL(30,8) NULL,
  `fee` DECIMAL(30,8) NOT NULL DEFAULT 0,
  `netPnl` DECIMAL(30,8) NULL,
  `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `closedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Trade_positionId_key`(`positionId`),
  INDEX `Trade_userId_status_openedAt_idx`(`userId`, `status`, `openedAt`),
  INDEX `Trade_status_openedAt_idx`(`status`, `openedAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Settlement` (
  `id` CHAR(36) NOT NULL,
  `tradeId` CHAR(36) NOT NULL,
  `status` ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  `settlementPrice` DECIMAL(30,12) NULL,
  `grossPayout` DECIMAL(30,8) NULL,
  `fees` DECIMAL(30,8) NOT NULL DEFAULT 0,
  `netPnl` DECIMAL(30,8) NULL,
  `referenceId` VARCHAR(127) NULL,
  `settledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Settlement_tradeId_key`(`tradeId`),
  INDEX `Settlement_status_settledAt_idx`(`status`, `settledAt`),
  INDEX `Settlement_referenceId_idx`(`referenceId`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Wallet` (
  `id` CHAR(36) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `status` ENUM('ACTIVE','SUSPENDED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  `availableBalance` DECIMAL(30,8) NOT NULL DEFAULT 0,
  `heldBalance` DECIMAL(30,8) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Wallet_accountId_key`(`accountId`),
  INDEX `Wallet_status_idx`(`status`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WalletTransaction` (
  `id` CHAR(36) NOT NULL,
  `walletId` CHAR(36) NOT NULL,
  `type` ENUM('DEPOSIT','WITHDRAWAL','TRADE_HOLD','TRADE_RELEASE','SETTLEMENT','FEE','ADJUSTMENT') NOT NULL,
  `status` ENUM('PENDING','PROCESSING','COMPLETED','FAILED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `amount` DECIMAL(30,8) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `idempotencyKey` VARCHAR(128) NOT NULL,
  `referenceType` VARCHAR(64) NULL,
  `referenceId` VARCHAR(128) NULL,
  `description` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `WalletTransaction_idempotencyKey_key`(`idempotencyKey`),
  INDEX `WalletTransaction_walletId_createdAt_idx`(`walletId`, `createdAt`),
  INDEX `WalletTransaction_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LedgerEntry` (
  `id` CHAR(36) NOT NULL,
  `transactionId` CHAR(36) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `walletTransactionId` CHAR(36) NULL,
  `direction` ENUM('DEBIT','CREDIT') NOT NULL,
  `amount` DECIMAL(30,8) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `referenceType` VARCHAR(64) NULL,
  `referenceId` VARCHAR(128) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `LedgerEntry_transactionId_idx`(`transactionId`),
  INDEX `LedgerEntry_accountId_createdAt_idx`(`accountId`, `createdAt`),
  INDEX `LedgerEntry_walletTransactionId_idx`(`walletTransactionId`),
  INDEX `LedgerEntry_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Deposit` (
  `id` CHAR(36) NOT NULL,
  `walletId` CHAR(36) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `providerReference` VARCHAR(128) NULL,
  `amount` DECIMAL(30,8) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `status` ENUM('PENDING','PROCESSING','COMPLETED','FAILED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `failureReason` VARCHAR(255) NULL,
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Deposit_providerReference_key`(`providerReference`),
  INDEX `Deposit_walletId_createdAt_idx`(`walletId`, `createdAt`),
  INDEX `Deposit_provider_status_createdAt_idx`(`provider`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Withdrawal` (
  `id` CHAR(36) NOT NULL,
  `walletId` CHAR(36) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `providerReference` VARCHAR(128) NULL,
  `amount` DECIMAL(30,8) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `status` ENUM('PENDING','PROCESSING','COMPLETED','FAILED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `failureReason` VARCHAR(255) NULL,
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Withdrawal_providerReference_key`(`providerReference`),
  INDEX `Withdrawal_walletId_createdAt_idx`(`walletId`, `createdAt`),
  INDEX `Withdrawal_provider_status_createdAt_idx`(`provider`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `KycCase` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `provider` VARCHAR(64) NULL,
  `providerCaseId` VARCHAR(128) NULL,
  `status` ENUM('NOT_STARTED','PENDING','IN_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'NOT_STARTED',
  `submittedAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `KycCase_providerCaseId_key`(`providerCaseId`),
  INDEX `KycCase_userId_status_idx`(`userId`, `status`),
  INDEX `KycCase_provider_status_idx`(`provider`, `status`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Notification` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `type` ENUM('TRADE_RESULT','DEPOSIT','WITHDRAWAL','SECURITY','VERIFICATION','SYSTEM') NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `body` TEXT NOT NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuditLog` (
  `id` CHAR(36) NOT NULL,
  `actorUserId` CHAR(36) NULL,
  `action` VARCHAR(100) NOT NULL,
  `entityType` VARCHAR(64) NOT NULL,
  `entityId` VARCHAR(127) NULL,
  `metadata` JSON NULL,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
  INDEX `AuditLog_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
  INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Session`
  ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Device`
  ADD CONSTRAINT `Device_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Account`
  ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Market`
  ADD CONSTRAINT `Market_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Order`
  ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Order_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Order_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Position`
  ADD CONSTRAINT `Position_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Position_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Position_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Position_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Trade`
  ADD CONSTRAINT `Trade_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `Position`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Trade_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Settlement`
  ADD CONSTRAINT `Settlement_tradeId_fkey` FOREIGN KEY (`tradeId`) REFERENCES `Trade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Wallet`
  ADD CONSTRAINT `Wallet_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `WalletTransaction`
  ADD CONSTRAINT `WalletTransaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `LedgerEntry`
  ADD CONSTRAINT `LedgerEntry_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `LedgerEntry_walletTransactionId_fkey` FOREIGN KEY (`walletTransactionId`) REFERENCES `WalletTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Deposit`
  ADD CONSTRAINT `Deposit_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Withdrawal`
  ADD CONSTRAINT `Withdrawal_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `KycCase`
  ADD CONSTRAINT `KycCase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Notification`
  ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AuditLog`
  ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
