-- A trade that settles at exactly its entry price is a draw: the stake is returned without profit.
ALTER TABLE `Trade` MODIFY COLUMN `status` ENUM('OPEN','WON','LOST','DRAW','CANCELLED','EXPIRED') NOT NULL DEFAULT 'OPEN';
