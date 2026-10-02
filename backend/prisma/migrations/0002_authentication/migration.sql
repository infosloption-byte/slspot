-- Authentication and session token persistence
ALTER TABLE `User`
  ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL;

CREATE TABLE `AuthToken` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `type` ENUM('EMAIL_VERIFICATION','PASSWORD_RESET') NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AuthToken_tokenHash_key`(`tokenHash`),
  INDEX `AuthToken_userId_type_expiresAt_idx`(`userId`, `type`, `expiresAt`),
  INDEX `AuthToken_userId_type_consumedAt_idx`(`userId`, `type`, `consumedAt`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AuthToken`
  ADD CONSTRAINT `AuthToken_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
