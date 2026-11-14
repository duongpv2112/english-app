import type { PrismaClient } from '@english-app/api/db'
import { createHash } from 'node:crypto'

/** Turns text into MP3 bytes with the given voice. The real one calls Azure; tests pass a fake. */
export type Synthesizer = (text: string, voice: string) => Promise<Uint8Array>
/** Stores a file under a key. The real one uploads to R2; tests pass a fake. */
export type Uploader = (key: string, body: Uint8Array) => Promise<void>

export const WORD_VOICE = 'en-US-JennyNeural'
/** Example sentences rotate through accents so listening practice is not tied to one voice. */
export const EXAMPLE_VOICES = ['en-US-GuyNeural', 'en-GB-SoniaNeural', 'en-AU-NatashaNeural']

export interface TtsOptions {
  /** Maximum number of words (each with its examples) to process in this run. */
  limit?: number
  log?: (message: string) => void
}

/**
 * Creates and uploads audio for enriched words and their example sentences that have none yet.
 * An audioKey is saved only after its upload succeeded, so a failed item is retried on the next run.
 */
export async function generateAudio(
  db: PrismaClient,
  synth: Synthesizer,
  upload: Uploader,
  opts: TtsOptions = {},
): Promise<{ words: number; examples: number; failed: number }> {
  const log = opts.log ?? console.error
  const pending = await db.word.findMany({
    where: {
      meaningVi: { not: null },
      OR: [{ audioKey: null }, { examples: { some: { audioKey: null } } }],
    },
    orderBy: { tslRank: 'asc' },
    take: opts.limit,
    include: { examples: { orderBy: { id: 'asc' } } },
  })

  const done = { words: 0, examples: 0, failed: 0 }

  async function attempt(label: string, kind: 'words' | 'examples', run: () => Promise<void>) {
    try {
      await run()
      done[kind]++
    } catch (err) {
      done.failed++
      log(`Audio failed for ${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  for (const word of pending) {
    if (!word.audioKey) {
      await attempt(`word "${word.lemma}"`, 'words', async () => {
        const audioKey = `audio/words/${word.id}.mp3`
        await upload(audioKey, await synth(word.lemma, WORD_VOICE))
        await db.word.update({ where: { id: word.id }, data: { audioKey } })
      })
    }
    for (const [i, example] of word.examples.entries()) {
      if (example.audioKey) continue
      await attempt(`example of "${word.lemma}"`, 'examples', async () => {
        const voice = EXAMPLE_VOICES[(word.tslRank + i) % EXAMPLE_VOICES.length]!
        // The text is part of the key: audio is cached for a year, so a corrected sentence must
        // not reuse the address of the old recording.
        const textHash = createHash('sha256').update(example.textEn).digest('hex').slice(0, 8)
        const audioKey = `audio/examples/${example.id}-${textHash}.mp3`
        await upload(audioKey, await synth(example.textEn, voice))
        await db.example.update({ where: { id: example.id }, data: { audioKey, voice } })
      })
    }
  }
  return done
}
