ALTER TABLE `Withdrawal`
  ADD COLUMN `destination` VARCHAR(255) NULL AFTER `providerReference`;
