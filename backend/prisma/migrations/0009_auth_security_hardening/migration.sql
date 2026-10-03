ALTER TABLE `User`
  ADD COLUMN `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `twoFactorSecretEnc` VARCHAR(512) NULL,
  ADD COLUMN `twoFactorPendingSecretEnc` VARCHAR(512) NULL,
  ADD COLUMN `loginFailedCount` INT NOT NULL DEFAULT 0,
  ADD COLUMN `loginLockedUntil` DATETIME(3) NULL;

ALTER TABLE `AuthToken`
  ADD COLUMN `attempts` INT NOT NULL DEFAULT 0;

ALTER TABLE `Session`
  ADD COLUMN `deviceId` CHAR(36) NULL;

CREATE INDEX `Session_deviceId_idx` ON `Session`(`deviceId`);

ALTER TABLE `Session`
  ADD CONSTRAINT `Session_deviceId_fkey`
  FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `RecoveryCode` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `codeHash` VARCHAR(128) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `RecoveryCode_codeHash_key` (`codeHash`),
  INDEX `RecoveryCode_userId_usedAt_idx` (`userId`, `usedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RecoveryCode_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;