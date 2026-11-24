# Contributing to KSecrets

Thank you for your interest in contributing to KSecrets! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Local Development

```bash
# Clone the repository
git clone https://github.com/wokabis/ksecrets.git
cd ksecrets

# Install dependencies
pnpm install

# Copy environment files
cp .env.example .env
cp .dev.vars.example apps/api/.dev.vars

# Edit apps/api/.dev.vars with your secrets:
#   SECRET_KEY_BASE=<openssl rand -hex 32>
#   KSECRETS_MASTER_KEY=<openssl rand -hex 32>

# Start development servers
pnpm dev
```

- Web UI: http://localhost:5173
- API: http://localhost:8787

### Project Structure

```
ksecrets/
├── apps/
│   ├── api/          # Hono Worker API (Cloudflare Workers)
│   ├── web/          # React + Vite + Tailwind (Cloudflare Pages)
│   └── cli/          # CLI tool (TypeScript + Commander)
├── packages/
│   ├── types/        # Zod schemas and shared types
│   ├── crypto/       # AES-GCM, PBKDF2, HKDF (Web Crypto)
│   ├── db/           # Kysely schema, D1 dialect
│   └── auth/         # JWT, passwords, MFA, API keys
```

## Development Workflow

### Running Checks

```bash
pnpm lint           # TypeScript type checking
pnpm test           # Run test suites
pnpm build          # Build all packages
```

### Making Changes

1. **Fork** the repository
2. **Create a branch** from `main` for your feature or fix
3. **Write tests** for new functionality
4. **Ensure all checks pass** (`pnpm lint && pnpm test && pnpm build`)
5. **Submit a pull request** with a clear description

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add email notification on push view
fix: correct passphrase validation timing
docs: update API documentation
chore: update dependencies
security: patch XSS vulnerability in note rendering
```

### Pull Request Guidelines

- Keep PRs focused on a single concern
- Include tests for new features and bug fixes
- Update documentation if the public API changes
- Reference related issues using `Closes #123`
- Ensure CI passes before requesting review

## Security

If you discover a security vulnerability, please follow our [Security Policy](SECURITY.md). **Do not open a public issue.**

## Architecture Decisions

### Key Principles

1. **Zero-knowledge** — The server never sees plaintext secrets
2. **Edge-first** — Everything runs on Cloudflare's edge network
3. **Minimal dependencies** — We prefer Web Crypto API over Node.js crypto modules in browser code
4. **Type safety** — Zod schemas are the single source of truth for validation

### Adding New Features

- API routes go in `apps/api/src/index.ts`
- Shared types go in `packages/types/src/index.ts`
- Crypto operations go in `packages/crypto/src/` (with separate browser/node implementations)
- Database schema changes go in `packages/db/src/schema.ts` and `packages/db/src/index.ts`

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
