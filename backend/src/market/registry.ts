import type { PrismaClient } from '../generated/prisma/client.js'

const DEFAULT_CRYPTO_ASSETS = [
  { symbol:'BTC/USD',name:'Bitcoin',type:'CRYPTO' as const,baseCurrency:'BTC',quoteCurrency:'USD',externalSymbol:'BTC/USD',sortOrder:10 },
  { symbol:'ETH/USD',name:'Ethereum',type:'CRYPTO' as const,baseCurrency:'ETH',quoteCurrency:'USD',externalSymbol:'ETH/USD',sortOrder:20 },
  { symbol:'BNB/USD',name:'BNB',type:'CRYPTO' as const,baseCurrency:'BNB',quoteCurrency:'USD',externalSymbol:'BNB/USD',sortOrder:30 },
  { symbol:'SOL/USD',name:'Solana',type:'CRYPTO' as const,baseCurrency:'SOL',quoteCurrency:'USD',externalSymbol:'SOL/USD',sortOrder:40 },
  { symbol:'XRP/USD',name:'XRP',type:'CRYPTO' as const,baseCurrency:'XRP',quoteCurrency:'USD',externalSymbol:'XRP/USD',sortOrder:50 },
  { symbol:'DOGE/USD',name:'Dogecoin',type:'CRYPTO' as const,baseCurrency:'DOGE',quoteCurrency:'USD',externalSymbol:'DOGE/USD',sortOrder:60 },
  { symbol:'ADA/USD',name:'Cardano',type:'CRYPTO' as const,baseCurrency:'ADA',quoteCurrency:'USD',externalSymbol:'ADA/USD',sortOrder:70 },
  { symbol:'AVAX/USD',name:'Avalanche',type:'CRYPTO' as const,baseCurrency:'AVAX',quoteCurrency:'USD',externalSymbol:'AVAX/USD',sortOrder:80 },
  { symbol:'LINK/USD',name:'Chainlink',type:'CRYPTO' as const,baseCurrency:'LINK',quoteCurrency:'USD',externalSymbol:'LINK/USD',sortOrder:90 },
]

const LEGACY_NON_CRYPTO_SYMBOLS = ['EUR/USD', 'GBP/USD', 'AAPL/USD', 'TSLA/USD', 'XAU/USD', 'NAS100/USD']


export async function ensureDefaultMarketRegistry(prisma: PrismaClient): Promise<void> {
  for (const definition of DEFAULT_CRYPTO_ASSETS) {
    const asset = await prisma.asset.upsert({
      where:{symbol:definition.symbol},
      create:{symbol:definition.symbol,name:definition.name,type:definition.type,baseCurrency:definition.baseCurrency,quoteCurrency:definition.quoteCurrency,isActive:true,sortOrder:definition.sortOrder},
      update:{name:definition.name,isActive:true,sortOrder:definition.sortOrder},
      select:{id:true},
    })
    await prisma.market.deleteMany({ where: { assetId: asset.id, provider: { not: 'binance' } } })
    await prisma.market.upsert({
      where:{provider_externalSymbol:{provider:'binance',externalSymbol:definition.externalSymbol}},
      create:{assetId:asset.id,provider:'binance',externalSymbol:definition.externalSymbol,status:'CLOSED'},
      update:{assetId:asset.id},
    })
  }

  await prisma.asset.updateMany({
    where: { symbol: { in: LEGACY_NON_CRYPTO_SYMBOLS } },
    data: { isActive: false },
  })
}
