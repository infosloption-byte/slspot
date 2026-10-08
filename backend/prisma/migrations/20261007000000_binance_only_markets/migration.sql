-- Binance is now the only market-data provider. Move existing crypto markets onto it and retire
-- the asset classes that only Twelve Data could price. Positions/orders keep their asset rows.

-- Drop Twelve Data/Kraken/OKX market rows that would collide with an existing Binance row.
DELETE m FROM `Market` m
  JOIN `Asset` a ON a.`id` = m.`assetId`
  JOIN `Market` b ON b.`provider` = 'binance' AND b.`externalSymbol` = m.`externalSymbol`
WHERE a.`type` = 'CRYPTO' AND m.`provider` <> 'binance';

UPDATE `Market` m
  JOIN `Asset` a ON a.`id` = m.`assetId`
SET m.`provider` = 'binance'
WHERE a.`type` = 'CRYPTO' AND m.`provider` <> 'binance';

UPDATE `Asset` SET `isActive` = false WHERE `type` <> 'CRYPTO';
