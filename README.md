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

Each word has two cards. The recognise card shows the word and asks for its meaning. Once that card is rated Good, a listen-and-type card is unlocked for the next day: it plays the audio and asks you to type the word.

`/dictation` is listening practice: it plays example sentences of words you have studied, you type what you hear, and the result is compared word by word (`packages/shared/src/dictation.ts`). It needs audio, so it stays empty until the importer's `tts` step has run and `AUDIO_BASE_URL` is set.

Set `AUDIO_BASE_URL` in `apps/api/.env` to the public address of the audio bucket to get audio on cards.

The home page is the overview: today's queue, the study streak, words known against the steady pace needed for 1,200 words by 1 February 2027, weekly dictation accuracy, and whether anything is still waiting to be sent. `/settings` sets new words per day, time zone and default audio speed. The "Báo sai" button on a revealed card corrects its meaning, IPA or example sentences.
