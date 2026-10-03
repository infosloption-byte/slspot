# SL Spot Authentication & Sessions

Status: implemented on `main` — 2026-10-03.

## Authentication model

The backend uses durable database-backed sessions rather than browser-stored bearer tokens.

```text
password
   ↓
scrypt password hash
   ↓
User
   ↓
opaque random session token
   ↓
SHA-256 token hash in Session
   ↓
HttpOnly cookie
```

Session tokens are never persisted in plaintext.

## Endpoints

Base path: `/api/v1/auth`.

| Method | Endpoint | Auth |
|---|---|---|
| POST | `/register` | public |
| POST | `/login` | public |
| POST | `/2fa/verify` | public challenge |
| GET | `/2fa/status` | session |
| POST | `/2fa/setup` | session |
| POST | `/2fa/enable` | session |
| POST | `/2fa/disable` | session |
| GET | `/devices` | session |
| GET | `/login-history` | session |
| GET | `/security-events` | session |
| POST | `/logout` | session |
| POST | `/logout-all` | session |
| GET | `/me` | session |
| GET | `/sessions` | session |
| DELETE | `/sessions/:sessionId` | session |
| POST | `/verify-email` | public |
| POST | `/verify-email/request` | public |
| POST | `/forgot-password` | public |
| POST | `/reset-password` | public |

## Security

- Session tokens are random opaque values; only SHA-256 hashes are stored.
- Sessions have explicit expiration and revocation timestamps.
- Authentication requires an active user and an unexpired, non-revoked session.
- Browser authentication uses an HttpOnly cookie with configurable Secure/SameSite/domain settings.
- Password reset revokes all active sessions for the user and clears login lockout counters.
- Five failed password attempts lock the account for a configurable period; locked responses return HTTP 429 with `Retry-After`.
- `rememberDevice` selects the server session lifetime; the session token remains inside the HttpOnly cookie.
- TOTP secrets are encrypted at rest with AES-256-GCM; production requires an explicitly configured 32-byte encryption key.
- Recovery codes are generated once, stored hashed, and consumed atomically.
- Sessions create and update tracked device records; device, login-history, and security-event APIs are user-scoped.
- Authentication lifecycle actions are written to the audit log.

Passwords use Node.js asynchronous `crypto.scrypt` with a unique random 16-byte salt. Node documents scrypt as a password-based key derivation function designed to make brute-force attacks more expensive and recommends a random salt of at least 16 bytes. citeturn827206search2

## Verification and password reset

Verification and reset tokens are random opaque values; only their SHA-256 hashes are stored in `AuthToken`.

The backend generates and persists these tokens. Actual email delivery is a separate integration boundary. For explicit local development only, generated tokens can be returned by setting:

```text
AUTH_EXPOSE_DEV_TOKENS=true
```

Keep it false in production.

## WebSocket authentication

The production server passes the authentication service into the realtime gateway. The WebSocket handshake must contain the session cookie before application websocket state is created. Unauthenticated connections are closed with WebSocket policy code `1008`.

## Remaining authentication follow-ups

Email-provider delivery, authorization/RBAC, final CSRF strategy, and broader production abuse controls remain later security work. Core login lockout, 2FA, recovery codes, device tracking, login history, and security-event views are implemented.


## Frontend session integration

The React frontend now uses the backend session as its single authentication authority.

```text
browser
   ↓
HttpOnly session cookie
   ↓
GET /api/v1/auth/me
   ↓
AuthProvider
   ↓
ProtectedRoute / account UI
```

The frontend does not store session tokens in localStorage or sessionStorage.

Implemented frontend behavior:

- Authentication bootstraps through `GET /auth/me`.
- Login stores the returned authenticated user in in-memory React state.
- Logout calls the backend and then clears in-memory session state.
- A `401` API response emits a session-expired event and clears the authenticated state.
- Protected routes wait for the initial session check before redirecting to login.
- Registration, email verification, password recovery and reset use the backend authentication endpoints.
- Development verification/reset tokens can be passed through the existing dev-only backend response; production does not expose those tokens.
- The account header shows the authenticated email and provides a server-backed sign-out control.

No authentication state is granted by demo/local-storage flags.
