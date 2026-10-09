ALTER TABLE `User`
  ADD COLUMN `displayName` VARCHAR(120) NULL,
  ADD COLUMN `timezone` VARCHAR(64) NULL,
  ADD COLUMN `locale` VARCHAR(35) NULL;

CREATE TABLE `UserPreference` (
  `userId` CHAR(36) NOT NULL,
  `compactTradingLayout` BOOLEAN NOT NULL DEFAULT false,
  `priceMovementAlerts` BOOLEAN NOT NULL DEFAULT false,
  `soundEnabled` BOOLEAN NOT NULL DEFAULT false,
  `emailTradeResults` BOOLEAN NOT NULL DEFAULT true,
  `emailWalletUpdates` BOOLEAN NOT NULL DEFAULT true,
  `emailSecurityAlerts` BOOLEAN NOT NULL DEFAULT true,
  `emailAnnouncements` BOOLEAN NOT NULL DEFAULT true,
  `emailSupportUpdates` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`userId`),
  CONSTRAINT `UserPreference_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportTicket` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `subject` VARCHAR(160) NOT NULL,
  `category` ENUM('ACCOUNT', 'TRADING', 'WALLET', 'TECHNICAL', 'OTHER') NOT NULL,
  `status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `resolvedAt` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  INDEX `SupportTicket_userId_status_updatedAt_idx` (`userId`, `status`, `updatedAt`),
  CONSTRAINT `SupportTicket_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportMessage` (
  `id` CHAR(36) NOT NULL,
  `ticketId` CHAR(36) NOT NULL,
  `authorUserId` CHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `SupportMessage_ticketId_createdAt_idx` (`ticketId`, `createdAt`),
  INDEX `SupportMessage_authorUserId_createdAt_idx` (`authorUserId`, `createdAt`),
  CONSTRAINT `SupportMessage_ticketId_fkey`
    FOREIGN KEY (`ticketId`) REFERENCES `SupportTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SupportMessage_authorUserId_fkey`
    FOREIGN KEY (`authorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SystemAnnouncement` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `body` TEXT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `createdByUserId` CHAR(36) NOT NULL,
  `publishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `SystemAnnouncement_status_publishedAt_idx` (`status`, `publishedAt`),
  CONSTRAINT `SystemAnnouncement_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Notification`
  ADD COLUMN `announcementId` CHAR(36) NULL,
  ADD INDEX `Notification_announcementId_idx` (`announcementId`),
  ADD CONSTRAINT `Notification_announcementId_fkey`
    FOREIGN KEY (`announcementId`) REFERENCES `SystemAnnouncement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

