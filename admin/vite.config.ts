const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:;",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const

// Vite's React Fast Refresh preamble is inline in development HTML.
// Permit it only on the dev server; preview/production keeps the strict policy.
const devSecurityHeaders = {
  ...securityHeaders,
  'Content-Security-Policy': securityHeaders['Content-Security-Policy'].replace(
    "script-src 'self'",
    "script-src 'self' 'unsafe-inline'",
  ),
} as const

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The meta tag used to be hard-coded in index.html, which broke the dev server's React preamble. Inject it into
// production builds only, so a static host that sends no headers still serves the admin app under the strict policy.
// (frame-ancestors is ignored in a meta tag; set it, and the other headers, on the web server as well.)
const productionCsp: Plugin = {
  name: 'admin-production-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const tag = '<meta http-equiv="Content-Security-Policy" content="' + securityHeaders['Content-Security-Policy'] + '" />'
    return html.replace('</head>', '    ' + tag + '\n  </head>')
  },
}

export default defineConfig({
  plugins: [react(), productionCsp],
  server: {
    port: 5174,
    headers: devSecurityHeaders,
    proxy: { '/api': 'http://localhost:8080' },
  },
  preview: {
    headers: securityHeaders,
  },
})
