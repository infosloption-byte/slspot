# SL Spot Authentication & Sessions

Status: implemented on `main` — 2026-10-02.

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
- Password reset revokes all active sessions for the user.
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

Rate limiting/abuse controls, email-provider delivery, MFA, authorization/RBAC, security-event notifications, full device management UX and the final CSRF strategy remain later security work.
