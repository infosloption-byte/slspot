-- Add explicit demo/real trading accounts. Existing accounts become demo accounts so
-- no development balance is accidentally exposed as real funds.
ALTER TABLE `Account`
  ADD COLUMN `mode` ENUM('DEMO', 'REAL') NOT NULL DEFAULT 'DEMO';

DROP INDEX `Account_userId_currency_key` ON `Account`;

CREATE UNIQUE INDEX `Account_userId_currency_mode_key`
  ON `Account`(`userId`, `currency`, `mode`);

-- Give every existing user a real account with an empty wallet.
INSERT INTO `Account` (`id`, `userId`, `name`, `currency`, `mode`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `demo`.`userId`, 'Real Trading Account', `demo`.`currency`, 'REAL', 'ACTIVE', NOW(3), NOW(3)
FROM `Account` AS `demo`
LEFT JOIN `Account` AS `real`
  ON `real`.`userId` = `demo`.`userId`
  AND `real`.`currency` = `demo`.`currency`
  AND `real`.`mode` = 'REAL'
WHERE `demo`.`mode` = 'DEMO'
  AND `real`.`id` IS NULL;

INSERT INTO `Wallet` (`id`, `accountId`, `currency`, `status`, `availableBalance`, `heldBalance`, `createdAt`, `updatedAt`)
SELECT UUID(), `account`.`id`, `account`.`currency`, 'ACTIVE', 0, 0, NOW(3), NOW(3)
FROM `Account` AS `account`
LEFT JOIN `Wallet` AS `wallet` ON `wallet`.`accountId` = `account`.`id`
WHERE `account`.`mode` = 'REAL'
  AND `wallet`.`id` IS NULL;
