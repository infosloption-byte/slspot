/*
  Warnings:

  - You are about to alter the column `referenceId` on the `wallettransaction` table. The data in that column could be lost. The data in that column will be cast from `VarChar(128)` to `VarChar(127)`.

*/
-- AlterTable
ALTER TABLE `wallettransaction` MODIFY `referenceId` VARCHAR(127) NULL;
