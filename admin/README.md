# SL Spot Admin

Standalone administration application for operational staff. It uses the same authenticated session cookie as the main account application, but every /api/v1/admin/* request is checked against the server-side AdminAccess record.

## Local development

From the repository root:

~~~powershell
cd admin
npm install
npm run dev
~~~

The Vite dev server runs on http://localhost:5174. Set VITE_API_BASE_URL when the API is not served from the same origin.

## Admin bootstrap

Set ADMIN_BOOTSTRAP_EMAILS on the backend to a comma-separated list of already-created active user emails. At backend startup, missing AdminAccess records are created with the ADMIN role.

Example:

~~~env
ADMIN_BOOTSTRAP_EMAILS=admin@example.com
~~~

Do not put passwords or session tokens in this setting.

## Scope

The current console covers operational dashboard metrics, user search/detail/status/session controls, trades, open positions, settlements, asset and market controls, wallets, funding requests, reconciliation, ledger inspection, risk limits/exposure/monitoring, and audit/security-event export.
