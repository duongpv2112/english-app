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

## Content

Vocabulary is loaded with the content importer (`pnpm importer <command>`). See `docs/content-importer.md`.

## Studying

After logging in, the home page shows today's queue (due cards, then new words) and `/study` runs the session: reveal the card, then rate it Again / Hard / Good / Easy. Scheduling is FSRS (`packages/shared/src/srs.ts`), shared by the web app and the API.

Set `AUDIO_BASE_URL` in `apps/api/.env` to the public address of the audio bucket to get audio on cards.
