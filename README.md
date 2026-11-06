# English App

Personal English learning app (TOEIC → B2 → IELTS). See `docs/superpowers/specs/` for the design.

## Development

Requirements: Node 24, pnpm (via `corepack enable`).

```bash
pnpm install
pnpm db:start   # local Postgres 17 on :5432 (embedded, no Docker)
pnpm dev        # api + web
pnpm test
```
