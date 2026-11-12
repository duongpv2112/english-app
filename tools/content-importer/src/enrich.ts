import type { PrismaClient } from '@english-app/api/db'
import { enrichedWordSchema, enrichOutputSchema, type EnrichedWord } from './enrichSchema.ts'

/** Returns raw JSON for the given lemmas; `enrich` validates it. */
export type WordEnricher = (lemmas: string[]) => Promise<unknown>

export interface EnrichOptions {
  limit?: number
  batchSize?: number
  maxAttempts?: number
  sleep?: (ms: number) => Promise<void>
  onBatch?: (done: number, total: number) => void
}

export interface EnrichFailure {
  lemma: string
  error: string
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Fills pos, IPA, Vietnamese meaning and examples for words that have no meaning yet,
 * in tslRank order. Each batch is retried (only its unfinished words) up to maxAttempts
 * times; words still failing are returned in `failed` and the next batch goes on.
 */
export async function enrich(
  db: PrismaClient,
  enricher: WordEnricher,
  opts: EnrichOptions = {},
): Promise<{ enriched: number; failed: EnrichFailure[] }> {
  const { limit, batchSize = 20, maxAttempts = 3, sleep = realSleep, onBatch } = opts
  const words = await db.word.findMany({
    where: { meaningVi: null },
    orderBy: { tslRank: 'asc' },
    take: limit,
    select: { id: true, lemma: true },
  })

  let enriched = 0
  const failed: EnrichFailure[] = []

  for (let start = 0; start < words.length; start += batchSize) {
    const batch = words.slice(start, start + batchSize)
    // lemma -> last error for words not saved yet
    const pending = new Map(batch.map((w) => [w.lemma, 'missing from response']))
    const idOf = new Map(batch.map((w) => [w.lemma, w.id]))

    for (let attempt = 1; attempt <= maxAttempts && pending.size > 0; attempt++) {
      if (attempt > 1) await sleep(1000 * 2 ** (attempt - 2))
      const lemmas = [...pending.keys()]
      let output
      try {
        output = enrichOutputSchema.parse(await enricher(lemmas))
      } catch (e) {
        for (const l of lemmas) pending.set(l, message(e))
        continue
      }
      for (const l of lemmas) pending.set(l, 'missing from response')
      for (const item of output.words) {
        const lemma = item.lemma.trim().toLowerCase()
        if (!pending.has(lemma)) continue
        const parsed = enrichedWordSchema.safeParse(item)
        if (!parsed.success) {
          pending.set(lemma, parsed.error.message)
          continue
        }
        if (await save(db, idOf.get(lemma)!, parsed.data)) enriched++
        pending.delete(lemma)
      }
    }

    for (const [lemma, error] of pending) failed.push({ lemma, error })
    onBatch?.(Math.min(start + batchSize, words.length), words.length)
  }

  return { enriched, failed }
}

/** Saves one word; returns false if it was already enriched (so examples are never added twice). */
async function save(db: PrismaClient, wordId: string, w: EnrichedWord): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.word.updateMany({
      where: { id: wordId, meaningVi: null },
      data: { pos: w.pos, ipa: w.ipa, meaningVi: w.meaningVi, enrichedAt: new Date() },
    })
    if (count !== 1) return false
    await tx.example.createMany({
      data: w.examples.map((e) => ({ wordId, textEn: e.textEn, textVi: e.textVi })),
    })
    return true
  })
}
