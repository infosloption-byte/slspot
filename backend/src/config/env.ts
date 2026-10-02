const port = Number(process.env.PORT ?? '8080')

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be a valid TCP port between 1 and 65535')
}

export const env = {
  host: process.env.HOST ?? '0.0.0.0',
  port,
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
} as const
