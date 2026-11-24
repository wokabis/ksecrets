# Password Pusher — $0 Architecture Rewrite

A modern, secure, zero-infrastructure rewrite of [PasswordPusher](https://github.com/pglombardo/PasswordPusher) built for **$0 hosting costs** using edge computing and serverless platforms.

## 🎯 Features

- **Zero-knowledge encryption** — Secrets encrypted in browser (AES-GCM) before leaving device
- **Automatic expiration** — By views (1-1000) and/or time (hours to 365 days)
- **Full audit trail** — Track every view with IP, user agent, timestamp
- **File support** — Upload files up to 100MB (stored in R2)
- **Passphrase protection** — Optional additional encryption layer
- **31+ languages** — Ready for internationalization
- **API-first** — REST API v2 with OpenAPI spec
- **CLI included** — `pwpush` command for terminal usage
- **Admin dashboard** — User management, API keys, system stats
- **MFA support** — TOTP with backup codes
- **Custom themes** — 26 Bootswatch themes + custom CSS

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Cloudflare    │     │   Cloudflare    │     │   Neon/Turso/   │
│    Pages        │────▶│    Workers      │────▶│   Supabase      │
│  (Static UI)    │     │   (API/Edge)    │     │   (SQLite/Postgres)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Cloudflare    │
                       │       R2        │
                       │  (File Storage) │
                       └─────────────────┘
```

| Layer | Technology | Free Tier |
|-------|------------|-----------|
| **Compute** | Cloudflare Workers | 100k req/day |
| **Static Hosting** | Cloudflare Pages | Unlimited bandwidth |
| **Database** | Neon / Turso / Supabase | 512MB - 1GB |
| **File Storage** | Cloudflare R2 | 10 GB |
| **CI/CD** | GitHub Actions | 2000 min/mo |
| **Container Registry** | ghcr.io | 1 GB private |

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Cloudflare account (for deployment)
- Database: Neon, Turso, or Supabase (all have free tiers)

### Local Development

```bash
# Clone and install
git clone https://github.com/yourusername/pwpush.git
cd pwpush
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env with your keys (see below)

# Generate encryption keys
openssl rand -hex 32  # For SECRET_KEY_BASE
openssl rand -hex 32  # For PWPUSH_MASTER_KEY

# Start development (runs API + Web concurrently)
pnpm dev
```

Open `http://localhost:5173` for the web UI, `http://localhost:8787` for the API.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_PATH` | Dev only | SQLite path for local dev |
| `DATABASE_URL` | Prod | Neon/Turso/Supabase connection string |
| `SECRET_KEY_BASE` | Yes | JWT signing key (32 bytes hex) |
| `PWPUSH_MASTER_KEY` | Yes | Payload encryption key (32 bytes hex) |
| `CLOUDFLARE_API_TOKEN` | Deploy | Cloudflare API token with Workers/Pages permissions |
| `CF_ACCOUNT_ID` | Deploy | Cloudflare account ID |
| `R2_*` | Files | R2 credentials for file uploads |
| `VITE_MASTER_KEY` | Frontend | Same as PWPUSH_MASTER_KEY for client-side encryption |

### Database Setup

Choose one:

**Turso (libSQL) — Recommended for edge**
```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create pwpush
turso db show pwpush --url
# Add to .env: DATABASE_URL=libsql://...
```

**Neon Postgres**
```bash
# Create project at https://neon.tech
# Copy connection string to DATABASE_URL
```

**Supabase**
```bash
# Create project at https://supabase.com
# Settings → Database → Connection string
```

### Deploy to Production

```bash
# One-time: authenticate Cloudflare
wrangler login

# Deploy API
pnpm deploy:api

# Deploy Web
pnpm deploy:web

# Or deploy both
pnpm deploy:all
```

**Or push to main branch** — GitHub Actions handles everything automatically.

## 📦 Monorepo Structure

```
pwpush/
├── apps/
│   ├── api/           # Hono Worker (Cloudflare Workers)
│   ├── web/           # React + Vite + Tailwind (Cloudflare Pages)
│   └── cli/           # TypeScript CLI (commander)
├── packages/
│   ├── types/         # Zod schemas + shared types
│   ├── crypto/        # Web Crypto (AES-GCM, PBKDF2, HKDF)
│   ├── db/            # Kysely + SQLite/Postgres dialect
│   └── auth/          # JWT + MFA (jose, otplib)
├── .github/workflows/ # CI/CD
├── turbo.json         # Turborepo pipeline
└── pnpm-workspace.yaml
```

## 🔐 Security Model

1. **Client-side encryption** — Payload encrypted with Web Crypto API before leaving browser
2. **Master key encryption** — Server re-encrypts with master key for storage (enables passphrase)
3. **Passphrase** — Optional PBKDF2-derived key, never stored, verified via hash
4. **JWT auth** — HS256 tokens, 24h access + 30d refresh
5. **API keys** — SHA-256 hashed, scoped permissions
6. **Rate limiting** — KV-based, 100 req/min per IP
7. **Audit logging** — Immutable append-only log
8. **CSP/COOP/COEP** — Security headers on all responses

## 📚 API Reference

### Create Push
```bash
POST /api/v2/pushes
{
  "kind": "password" | "note" | "file" | "url",
  "payload": "encrypted-base64",
  "passphrase": "optional",
  "expiryViews": 1,
  "expiryDays": 7,
  "filename": "secret.txt",
  "note": "For John",
  "retrieverEmail": "john@example.com"
}
```

### View Push
```bash
POST /api/v2/pushes/:id
{ "passphrase": "optional" }
```

### Audit Logs
```bash
GET /api/v2/audit?pushId=&action=viewed&limit=100
```

### Authentication
```bash
POST /api/v2/auth/login
{ "email": "", "password": "", "mfaCode": "" }
```

## 🛠️ CLI Usage

```bash
# Install globally (after build)
pnpm --filter @pwpush/cli build
npm install -g ./apps/cli

# Configure
pwpush config --url https://api.yourdomain.com --key pwp_xxx --master-key abc123...

# Create push
pwpush push --type password --payload "my-secret" --views 1 --days 1

# From file
pwpush push --file ./credentials.json --passphrase "extra-secret"

# From stdin
echo "secret" | pwpush push --payload -

# View push
pwpush view abc123-def456 --passphrase "extra-secret"

# Audit logs
pwpush audit --action viewed --limit 20
```

## 🎨 Customization

### Themes
Set `THEME` in settings or env: `cerulean`, `cosmo`, `cyborg`, `darkly`, `flatly`, `journal`, `litera`, `lumen`, `lux`, `materia`, `minty`, `morph`, `pulse`, `quartz`, `sandstone`, `simplex`, `sketchy`, `slate`, `solar`, `spacelab`, `superhero`, `united`, `vapor`, `yeti`, `zephyr`

### Custom CSS
Admin → Settings → Custom CSS (stored in DB, served as static file)

### Branding
- `SITE_NAME` — Instance name
- `SITE_URL` — Base URL for links
- Favicon: replace `public/favicon.svg`

## 🧪 Testing

```bash
# Unit tests
pnpm test

# E2E (requires local dev running)
pnpm test:e2e

# Type check
pnpm -r exec tsc --noEmit
```

## 📄 License

Apache 2.0 — Same as original PasswordPusher. See [LICENSE](LICENSE).

## 🙏 Credits

- Original [PasswordPusher](https://github.com/pglombardo/PasswordPusher) by Peter Giacomo Lombardo
- Built with [Hono](https://hono.dev), [React](https://react.dev), [Tailwind](https://tailwindcss.com), [Kysely](https://kysely.dev), [Turborepo](https://turbo.build)
- Deployed on [Cloudflare](https://cloudflare.com) (Workers, Pages, R2, D1/KV)
- Database: [Neon](https://neon.tech) / [Turso](https://turso.tech) / [Supabase](https://supabase.com)

## 🤝 Contributing

1. Fork the repo
2. Create feature branch
3. Make changes with tests
4. Run `pnpm lint && pnpm test && pnpm -r exec tsc --noEmit`
5. Submit PR

---

**Built for $0 architecture** — No servers, no containers, no maintenance. Just code that runs at the edge.