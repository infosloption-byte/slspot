CREATE TABLE `PolicyAcceptance` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `policyType` ENUM(
    'TERMS_AND_CONDITIONS',
    'PRIVACY_POLICY',
    'TRADING_RULES',
    'PAYMENT_POLICY',
    'RETURN_REFUND_POLICY',
    'AML_KYC_POLICY',
    'COOKIE_POLICY',
    'CARDHOLDER_AGREEMENT'
  ) NOT NULL,
  `version` VARCHAR(32) NOT NULL,
  `acceptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `source` VARCHAR(32) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `PolicyAcceptance_userId_policyType_version_key` (`userId`, `policyType`, `version`),
  INDEX `PolicyAcceptance_userId_policyType_acceptedAt_idx` (`userId`, `policyType`, `acceptedAt`),
  INDEX `PolicyAcceptance_policyType_version_acceptedAt_idx` (`policyType`, `version`, `acceptedAt`),
  CONSTRAINT `PolicyAcceptance_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
