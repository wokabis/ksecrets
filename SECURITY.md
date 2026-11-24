# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in KSecrets, please report it responsibly.

**Do NOT open a public issue.**

Instead, please email **security@ksecrets.dev** with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. The potential impact
4. Any suggested fixes (optional)

We will acknowledge your report within **48 hours** and provide a detailed response within **5 business days** indicating the next steps.

## Security Architecture

KSecrets implements defense-in-depth with these layers:

### Client-Side Encryption
- Every inline push generates a fresh 256-bit AES-GCM key in the browser
- The key is placed in the URL fragment (`#k=...`), which is **never** sent to the server
- The server stores only double-encrypted ciphertext and cannot read secrets

### Server-Side Encryption
- The API wraps client ciphertext with `KSECRETS_MASTER_KEY` using HKDF + AES-256-GCM
- Each push gets a unique derived key via HKDF with push-specific context
- Database dumps alone cannot expose ciphertext for offline attacks

### Authentication & Sessions
- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations)
- Sessions use HS256 JWTs with 24h access / 30d refresh tokens
- HttpOnly cookies with `SameSite=None; Secure` in production
- API keys are `ks_`-prefixed, SHA-256 hashed at rest, scoped and revocable

### Multi-Factor Authentication
- TOTP via authenticator apps (RFC 6238)
- 10 one-time backup codes, stored as SHA-256 hashes
- Backup codes are consumed on use

### Rate Limiting
- KV-backed per-IP rate limits on all sensitive endpoints
- Registration: 10/min, Login: 20/min, Push creation: 60/min

### Transport Security
- HSTS headers enforced
- CSP, X-Content-Type-Options, X-Frame-Options headers
- CORS allow-list with credential support
- Constant-time hash comparisons to prevent timing attacks

### File Security
- Files stored in Cloudflare R2 with encryption at rest
- Access gated by push state, passphrase, and view limits
- R2 objects deleted when pushes are deleted

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We ask that you:

- Allow us reasonable time to fix the issue before public disclosure
- Make a good-faith effort to avoid privacy violations, data destruction, and service disruption
- Do not access or modify data belonging to other users

We will credit you in the security advisory (unless you prefer to remain anonymous).
