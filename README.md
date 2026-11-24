# KSecrets

Secure, self-destructing secret sharing — passwords, notes, URLs and files — running entirely on Cloudflare's edge (Workers, Pages, D1, KV, R2) with a React UI, REST API v2, and a CLI.

A modern rewrite of [PasswordPusher](https://github.com/pglombardo/PasswordPusher) with an enterprise control plane: accounts, TOTP MFA, scoped API keys, audit logs, admin console, rate limiting, and encrypted file sharing.

## Features

- **End-to-end inline encryption** — passwords, notes, and URLs are encrypted in the browser with a random 256-bit key. The key lives only in the URL fragment (`#k=...`), which browsers never send to the server. The server stores an outer-encrypted ciphertext and cannot read the secret.
- **File sharing via R2** — uploads up to 100 MB (configurable), stored in Cloudflare R2, gated by optional passphrase, view limits, and expiry.
- **Expiry controls** — burn after N views and/or expire after N days; expired pushes are rejected and cleaned up by a scheduled job.
- **Passphrases** — optional second factor for retrieval, hashed with PBKDF2-SHA256 (100,000 iterations).
- **Full audit trail** — every create, view, download, failed passphrase, expiry, and deletion, with IP and user agent.
- **Accounts & RBAC** — JWT access/refresh cookies, first registered user becomes admin, admin user management and export.
- **TOTP MFA** — authenticator-app enrollment with hashed one-time backup codes.
- **API keys** — `ks_`-prefixed keys, SHA-256 hashed at rest, scoped and optionally expiring.
- **Rate limiting** — KV-backed per-IP limits on register, login, push creation, views, and downloads.
- **Admin settings** — site name, payload/file limits, anonymous access, MFA policy, defaults.
- **REST API v2** — JSON API with OpenAPI 3.1 descriptor at `/api/v2/openapi.json`.
- **CLI** — create, view, download, and audit from the terminal, including stdin and file pushes.
- **Dark-mode UI** — responsive React + Tailwind interface.

## Architecture

```
Cloudflare Pages (React UI)
        │  HTTPS / cookies
        ▼
Cloudflare Workers (Hono API)
        ├── D1         pushes, users, api_keys, audit_logs, settings, files
        ├── KV         rate limiting
        └── R2         encrypted file objects
```

| Layer | Technology |
|---|---|
| API | Hono on Cloudflare Workers |
| UI | React 18 + Vite + Tailwind |
| Database | Cloudflare D1 (SQLite) via Kysely + `kysely-d1` |
| Object storage | Cloudflare R2 |
| Rate limits | Workers KV |
| Auth | `jose` JWT, PBKDF2 password hashing, `otplib` TOTP |
| CLI | TypeScript + commander |

## Quick start (local)

Requirements: Node.js 20+, pnpm 9+.

```bash
pnpm install

cp .env.example .env                 # values for local scripts/tests
cp .dev.vars.example apps/api/.dev.vars   # wrangler dev reads .dev.vars from the worker dir
# edit apps/api/.dev.vars: SECRET_KEY_BASE and KSECRETS_MASTER_KEY (openssl rand -hex 32)

pnpm dev
```

- Web UI: http://localhost:5173
- API: http://localhost:8787 (wrangler dev, local D1/KV/R2 simulation)

The first account you register becomes the administrator.

### Local environment variables

`apps/api/.dev.vars` (worker runtime):

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY_BASE` | yes | JWT signing secret (32+ random bytes, hex) |
| `KSECRETS_MASTER_KEY` | yes | Outer payload encryption key — 64-char hex |
| `WEB_URL` | no | Base URL used in generated links (defaults to request origin) |
| `CORS_ORIGINS` | no | Comma-separated allowed web origins |
| `RESEND_API_KEY` | no | Resend API key for recipient notification emails |
| `EMAIL_FROM` | no | From address for notifications |

`.env` (Node-side scripts, optional): `DATABASE_PATH` for local SQLite tooling (`pnpm db:migrate`, `pnpm db:seed`).

The web UI no longer needs a build-time encryption key: every inline push gets a fresh key embedded in its URL fragment.

## Deploy to Cloudflare

```bash
# 1. Authenticate
npx wrangler login

# 2. Create resources (once)
npx wrangler d1 create ksecrets-db
npx wrangler kv namespace create RATE_LIMIT
npx wrangler r2 bucket create ksecrets-files

# 3. Put the IDs from step 2 into apps/api/wrangler.toml
#    (database_id, kv id)

# 4. Set production secrets
npx wrangler secret put SECRET_KEY_BASE --config apps/api/wrangler.toml
npx wrangler secret put KSECRETS_MASTER_KEY --config apps/api/wrangler.toml
# optional: RESEND_API_KEY, EMAIL_FROM, WEB_URL, CORS_ORIGINS

# 5. Apply the schema remotely
npx wrangler d1 execute ksecrets-db --remote --file=./schema.sql   # or let the Worker initialize on first request

# 6. Deploy
pnpm deploy:api
pnpm --filter @ksecrets/web build   # set VITE_API_URL for the Pages build
pnpm deploy:web
```

Schema initialization is idempotent and runs automatically on the first API request (`CREATE TABLE IF NOT EXISTS` plus settings seeds).

### GitHub Actions

CI (lint, typecheck, tests, builds) runs on every push and PR and needs no secrets.

Deployment jobs are **disabled by default**. To enable them, set repository variable `ENABLE_DEPLOY=true` plus:

- Secrets: `CLOUDFLARE_API_TOKEN`, `SECRET_KEY_BASE`, `KSECRETS_MASTER_KEY`
- Variables: `CF_ACCOUNT_ID`, `D1_DATABASE_ID`, `KV_NAMESPACE_ID`, `VITE_API_URL`

The deploy workflow patches the D1/KV IDs into `wrangler.toml` before deploying. Without a Cloudflare token with Workers, Pages, D1, KV, and R2 permissions, leave `ENABLE_DEPLOY` unset — the pipeline stays green and skips deployment.

## Security model

1. **Per-push encryption key** — generated in the browser with `crypto.getRandomValues`, used with AES-256-GCM (`@ksecrets/crypto`), and placed in the URL fragment (`/s/<id>#k=<key>`). URL fragments are never transmitted to the server or written to access logs.
2. **Outer encryption at rest** — the API wraps the client ciphertext with `KSECRETS_MASTER_KEY` before writing to D1, so database dumps alone do not expose ciphertext for offline attacks.
3. **Passphrases** — PBKDF2-SHA256, 100k iterations, random salt; verified server-side without storing the passphrase.
4. **Sessions** — HS256 JWTs, 24 h access / 30 d refresh, HttpOnly cookies with `SameSite=None; Secure` in production.
5. **API keys** — random `ks_` secrets, only SHA-256 hashes stored, scoped and revocable.
6. **MFA** — TOTP secrets stored server-side; backup codes stored as SHA-256 hashes and consumed once.
7. **Files** — stored in R2; access is gated by the push state and passphrase, and the object is deleted when the push is deleted. R2 encrypts objects at rest.
8. **Hardening** — CSP, HSTS and related security headers, CORS allow-list, per-IP rate limits, constant-time hash comparisons, and no secret logging.

**Operational notes**

- Back up `KSECRETS_MASTER_KEY` and `SECRET_KEY_BASE` outside the deployment. Rotating the master key makes existing inline ciphertext undecryptable.
- Losing a push URL fragment means the inline secret cannot be recovered — this is by design.
- D1 limits a row to 2 MB, so inline payloads are capped at 1 MB by default; larger content belongs in the R2-backed file flow (100 MB default).
- Configure an R2 lifecycle rule if you want hard deletion of expired file objects.

## API v2

Base: `<api-origin>/api/v2`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness |
| GET | `/version` | — | Build info |
| GET | `/openapi.json` | — | OpenAPI descriptor |
| POST | `/auth/register` | — | Create account (first = admin) |
| POST | `/auth/login` | — | Password + optional MFA |
| POST | `/auth/refresh` | cookie | Rotate tokens |
| POST | `/auth/logout` | cookie | Clear cookies |
| GET | `/auth/me` | cookie/bearer | Current user |
| PUT | `/auth/profile` | auth | Update name |
| PUT | `/auth/password` | auth | Change password |
| GET/POST | `/auth/api-keys` | auth | List / create API keys |
| DELETE | `/auth/api-keys/:id` | auth | Revoke key |
| POST | `/auth/mfa/enable` | auth | Start TOTP enrollment |
| POST | `/auth/mfa/verify` | auth | Confirm TOTP code |
| POST | `/auth/mfa/disable` | auth | Disable MFA |
| POST | `/pushes` | optional | Create inline push |
| POST | `/files` | optional | Create file push (multipart) |
| GET | `/pushes` | auth | List own pushes (`scope=all` for admins) |
| GET/POST | `/pushes/:id` | — | View metadata / inline secret |
| GET/POST | `/pushes/:id/download` | — | Download file push |
| DELETE | `/pushes/:id` | auth | Delete push (owner/admin) |
| GET | `/audit` | auth | Audit log (scoped) |
| GET | `/admin/stats` | admin | Usage statistics |
| GET | `/admin/users` | admin | List users |
| PATCH/DELETE | `/admin/users/:id` | admin | Update/delete user |
| GET | `/admin/export/:type` | admin | CSV export |
| GET/PUT | `/settings` | admin | Read/update settings |

Authentication accepts an HttpOnly session cookie, `Authorization: Bearer <jwt>`, or `X-API-Key: ks_...`.

### Examples

```bash
# Inline push (plaintext is outer-encrypted server-side; use the web/CLI for client-side encryption)
curl -X POST https://api.example.com/api/v2/pushes \
  -H 'Content-Type: application/json' \
  -d '{"kind":"note","payload":"hello","expiryViews":1,"expiryDays":7,"passphrase":"optional"}'

# File push (multipart, up to 100 MB)
curl -X POST https://api.example.com/api/v2/files \
  -F 'file=@./report.pdf' -F 'passphrase=optional' -F 'expiryViews=1' -F 'expiryDays=7'

# View inline secret / metadata
curl -X POST https://api.example.com/api/v2/pushes/<id> \
  -H 'Content-Type: application/json' -d '{"passphrase":"optional"}'

# Download file
curl -X POST https://api.example.com/api/v2/pushes/<id>/download \
  -H 'Content-Type: application/json' -d '{"passphrase":"optional"}' -o download.bin
```

## CLI

```bash
pnpm --filter @ksecrets/cli build
npm install -g ./apps/cli

ksecrets config --url http://localhost:8787 --key ks_xxx
ksecrets login                      # obtain a session token

# Inline pushes (encrypted with a fresh per-push key)
ksecrets push --type password --payload "my-secret" --views 1 --days 1
echo "secret" | ksecrets push --payload -

# File push (R2, up to 100 MB)
ksecrets push --file ./credentials.json --passphrase "extra-secret"

# View / download (pass the full secret URL so the #k= fragment is used)
ksecrets view 'https://app.example.com/s/<id>#k=<key>' --passphrase "extra-secret"
ksecrets view <id> --key <base64url-key> -o ./out.bin

# Audit
ksecrets audit --action viewed --limit 20
```

## Repository layout

```
ksecrets/
├── apps/
│   ├── api/          # Hono Worker + D1/KV/R2 bindings
│   ├── web/          # React + Vite + Tailwind (Pages)
│   └── cli/          # ksecrets CLI
├── packages/
│   ├── types/        # Zod schemas and shared types
│   ├── crypto/       # AES-GCM, PBKDF2, HKDF (Web Crypto)
│   ├── db/           # Kysely schema, D1 dialect, Node SQLite tooling
│   └── auth/         # JWT, passwords, MFA, API keys
├── .github/workflows/ci.yml
└── turbo.json
```

## Development checks

```bash
pnpm lint                     # tsc --noEmit across the workspace
pnpm test                     # vitest (crypto + types suites)
pnpm -r exec tsc --noEmit
pnpm build
```

An end-to-end API smoke test can be run against a live `wrangler dev` server; it covers registration, login, inline pushes, passphrase failures, burn-after-read, API keys, MFA, settings, audit, file upload/download, and deletion.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Credits

- Original [PasswordPusher](https://github.com/pglombardo/PasswordPusher) by Peter Giacomo Lombardo
- Built with [Hono](https://hono.dev), [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [Kysely](https://kysely.dev), [Turborepo](https://turbo.build)
- Runs on [Cloudflare](https://cloudflare.com) Workers, Pages, D1, KV, and R2
