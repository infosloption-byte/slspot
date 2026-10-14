import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const contentSecurityPolicy =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:;"

const securityHeaders = {
  'Content-Security-Policy': contentSecurityPolicy,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const

// Vite's React plugin injects an inline HMR preamble during development.
// Keep the production/preview policy strict; relax only this dev-only requirement.
const devSecurityHeaders = {
  ...securityHeaders,
  'Content-Security-Policy': contentSecurityPolicy.replace(
    "script-src 'self'",
    "script-src 'self' 'unsafe-inline'",
  ),
} as const

/**
 * Search-engine tags that need the public address of the site. Set VITE_SITE_URL (for example https://www.example.com)
 * when building for production. Without it the tags that need an address are left out instead of pointing at a wrong
 * one, and no sitemap is written. Also writes robots.txt (and sitemap.xml when the address is known).
 */
function siteMeta(siteUrl: string): Plugin {
  const base = siteUrl.replace(/\/+$/, '')
  return {
    name: 'slspot-site-meta',
    transformIndexHtml(html) {
      return html
        .split('\n')
        .filter((line) => base || !line.includes('data-site-url'))
        .join('\n')
        .replaceAll('__SITE_URL__', base)
        .replace(/ data-site-url/g, '')
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', 'Disallow: /app/', ...(base ? ['', 'Sitemap: ' + base + '/sitemap.xml'] : [])].join('\n') + '\n'
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
      if (!base) return
      const pages = ['/', '/policies/terms', '/policies/privacy', '/policies/trading-rules', '/policies/aml-kyc', '/policies/cookies']
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        pages.map((page) => '  <url><loc>' + base + page + '</loc></url>').join('\n') + '\n</urlset>\n'
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), siteMeta(loadEnv(mode, '.', 'VITE_').VITE_SITE_URL ?? '')],
  server: {
    strictPort: true,
    port: 5173,
    headers: devSecurityHeaders,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        rewriteWsOrigin: false,
      },
    },
  },
  preview: {
    headers: securityHeaders,
  },
}))
