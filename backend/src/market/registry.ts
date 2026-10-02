import type { PrismaClient } from '../generated/prisma/client.js'

const DEFAULT_ASSETS = [
  { symbol:'BTC/USD',name:'Bitcoin',type:'CRYPTO' as const,baseCurrency:'BTC',quoteCurrency:'USD',externalSymbol:'BTC/USD',sortOrder:10 },
  { symbol:'ETH/USD',name:'Ethereum',type:'CRYPTO' as const,baseCurrency:'ETH',quoteCurrency:'USD',externalSymbol:'ETH/USD',sortOrder:20 },
  { symbol:'SOL/USD',name:'Solana',type:'CRYPTO' as const,baseCurrency:'SOL',quoteCurrency:'USD',externalSymbol:'SOL/USD',sortOrder:30 },
  { symbol:'XRP/USD',name:'XRP',type:'CRYPTO' as const,baseCurrency:'XRP',quoteCurrency:'USD',externalSymbol:'XRP/USD',sortOrder:40 },
  { symbol:'EUR/USD',name:'Euro / US Dollar',type:'FOREX' as const,baseCurrency:'EUR',quoteCurrency:'USD',externalSymbol:'EUR/USD',sortOrder:50 },
  { symbol:'GBP/USD',name:'British Pound / US Dollar',type:'FOREX' as const,baseCurrency:'GBP',quoteCurrency:'USD',externalSymbol:'GBP/USD',sortOrder:60 },
  { symbol:'AAPL/USD',name:'Apple Inc.',type:'STOCK' as const,baseCurrency:'AAPL',quoteCurrency:'USD',externalSymbol:'AAPL',sortOrder:70 },
  { symbol:'TSLA/USD',name:'Tesla Inc.',type:'STOCK' as const,baseCurrency:'TSLA',quoteCurrency:'USD',externalSymbol:'TSLA',sortOrder:80 },
  { symbol:'XAU/USD',name:'Gold / US Dollar',type:'COMMODITY' as const,baseCurrency:'XAU',quoteCurrency:'USD',externalSymbol:'XAU/USD',sortOrder:90 },
  { symbol:'NAS100/USD',name:'Nasdaq 100',type:'INDEX' as const,baseCurrency:'NAS100',quoteCurrency:'USD',externalSymbol:'NDX',sortOrder:100 },
]

export async function ensureDefaultMarketRegistry(prisma: PrismaClient, provider: string): Promise<void> {
  for (const definition of DEFAULT_ASSETS) {
    const asset = await prisma.asset.upsert({
      where:{symbol:definition.symbol},
      create:{symbol:definition.symbol,name:definition.name,type:definition.type,baseCurrency:definition.baseCurrency,quoteCurrency:definition.quoteCurrency,isActive:true,sortOrder:definition.sortOrder},
      update:{name:definition.name,isActive:true,sortOrder:definition.sortOrder},
      select:{id:true},
    })
    await prisma.market.upsert({
      where:{provider_externalSymbol:{provider,externalSymbol:definition.externalSymbol}},
      create:{assetId:asset.id,provider,externalSymbol:definition.externalSymbol,status:'CLOSED'},
      update:{assetId:asset.id},
    })
  }
}
