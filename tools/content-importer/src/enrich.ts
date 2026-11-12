import type { PrismaClient } from '@english-app/api/db'
import { rmSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

export const PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'conjunction',
  'pronoun',
  'determiner',
  'other',
] as const

export const wordEnrichmentSchema = z.object({
  lemma: z.string(),
  pos: z.enum(PARTS_OF_SPEECH),
  ipa: z.string().trim().min(1),
  meaningVi: z.string().trim().min(1),
  examples: z
    .array(z.object({ textEn: z.string().trim().min(1), textVi: z.string().trim().min(1) }))
    .length(2),
})
export type WordEnrichment = z.infer<typeof wordEnrichmentSchema>

/** Produces card content for a batch of lemmas. The real one calls Claude; tests pass a fake. */
export type Enricher = (lemmas: string[]) => Promise<WordEnrichment[]>

export interface EnrichOptions {
  /** Maximum number of words to process in this run. */
  limit?: number
  /** Words per request. Default 20. */
  batchSize?: number
  /** Calls per batch before giving up on it. Default 3. */
  maxAttempts?: number
  sleep?: (ms: number) => Promise<void>
  /** Where to record the words whose batch failed every attempt. */
  failedPath: string
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Checks a response against the batch that was asked for and returns the content keyed by the
 * requested lemma. Throws unless every requested lemma is present exactly once and nothing else is.
 */
function validateBatch(lemmas: string[], response: unknown): Map<string, WordEnrichment> {
  const items = z.array(wordEnrichmentSchema).parse(response)
  const byLemma = new Map<string, WordEnrichment>()
  for (const item of items) {
    const key = item.lemma.trim().toLowerCase()
    if (!lemmas.includes(key)) throw new Error(`Response has a word that was not asked for: ${key}`)
    if (byLemma.has(key)) throw new Error(`Response repeats a word: ${key}`)
    byLemma.set(key, item)
  }
  const missing = lemmas.filter((l) => !byLemma.has(l))
  if (missing.length > 0) throw new Error(`Response is missing words: ${missing.join(', ')}`)
  return byLemma
}

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return `Invalid response: ${z.prettifyError(err)}`
  return err instanceof Error ? err.message : String(err)
}

/**
 * Fills in part of speech, IPA, Vietnamese meaning and two example sentences for words that have
 * no meaning yet, lowest TSL rank first. A batch is written all at once or not at all, so a rerun
 * simply picks up whatever is still missing.
 */
export async function enrichWords(
  db: PrismaClient,
  enricher: Enricher,
  opts: EnrichOptions,
): Promise<{ enriched: number; failed: number }> {
  const { batchSize = 20, maxAttempts = 3, sleep = defaultSleep } = opts
  const pending = await db.word.findMany({
    where: { meaningVi: null },
    orderBy: { tslRank: 'asc' },
    take: opts.limit,
    select: { id: true, lemma: true },
  })

  let enriched = 0
  const failures: { lemma: string; error: string }[] = []

  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize)
    const lemmas = batch.map((w) => w.lemma)

    let content: Map<string, WordEnrichment> | undefined
    let lastError = ''
    for (let attempt = 1; attempt <= maxAttempts && !content; attempt++) {
      if (attempt > 1) await sleep(1000 * 2 ** (attempt - 2))
      try {
        content = validateBatch(lemmas, await enricher(lemmas))
      } catch (err) {
        lastError = errorMessage(err)
      }
    }

    if (!content) {
      failures.push(...lemmas.map((lemma) => ({ lemma, error: lastError })))
      continue
    }

    const result = content
    await db.$transaction(
      batch.map((word) => {
        const c = result.get(word.lemma)!
        return db.word.update({
          where: { id: word.id },
          data: {
            pos: c.pos,
            ipa: c.ipa,
            meaningVi: c.meaningVi,
            examples: { create: c.examples },
          },
        })
      }),
    )
    enriched += batch.length
  }

  if (failures.length > 0) {
    writeFileSync(opts.failedPath, JSON.stringify(failures, null, 2) + '\n')
  } else {
    rmSync(opts.failedPath, { force: true })
  }
  return { enriched, failed: failures.length }
}
