import type { PrismaClient } from '@english-app/api/db'
import { parse } from 'csv-parse/sync'

export interface TslRow {
  lemma: string
  rank: number
}

/**
 * Parses a TSL word list. The header must have a `word` or `lemma` column; a `rank`
 * column is optional; without it the rank is the data row's position (the list is
 * already ordered by frequency).
 */
export function parseTslCsv(text: string): TslRow[] {
  const records: string[][] = parse(text, {
    bom: true,
    // Excel in comma-decimal locales (e.g. Vietnamese) saves "CSV" with semicolons.
    delimiter: [',', ';', '\t'],
    skip_empty_lines: true,
    relax_column_count: true,
  })
  const [header, ...data] = records
  const columns = (header ?? []).map((c) => c.trim().toLowerCase())
  const wordCol = columns.findIndex((c) => c === 'word' || c === 'lemma')
  if (wordCol === -1) throw new Error('CSV header must have a "word" or "lemma" column')
  const rankCol = columns.indexOf('rank')

  const seen = new Set<string>()
  const rankOwner = new Map<number, string>()
  const rows: TslRow[] = []
  data.forEach((record, i) => {
    const lemma = (record[wordCol] ?? '').trim().toLowerCase()
    if (!lemma || seen.has(lemma)) return
    seen.add(lemma)
    const rank = rankCol === -1 ? i + 1 : Number(record[rankCol])
    if (!Number.isInteger(rank) || rank < 1) {
      throw new Error(`Invalid rank for "${lemma}": ${record[rankCol]}`)
    }
    const owner = rankOwner.get(rank)
    if (owner) throw new Error(`Rank ${rank} is used by both "${owner}" and "${lemma}"`)
    rankOwner.set(rank, lemma)
    rows.push({ lemma, rank })
  })
  return rows
}

export interface RankConflict {
  lemma: string
  rank: number
  takenBy: string
}

/**
 * Inserts words that are not there yet. A lemma that already exists is `skipped`; a new
 * lemma whose rank belongs to another word is not inserted and is listed in `rankConflicts`.
 */
export async function importTsl(
  db: PrismaClient,
  rows: TslRow[],
): Promise<{ inserted: number; skipped: number; rankConflicts: RankConflict[] }> {
  const existing = await db.word.findMany({
    where: {
      OR: [
        { lemma: { in: rows.map((r) => r.lemma) } },
        { tslRank: { in: rows.map((r) => r.rank) } },
      ],
    },
    select: { lemma: true, tslRank: true },
  })
  const lemmas = new Set(existing.map((w) => w.lemma))
  const rankOwner = new Map(existing.map((w) => [w.tslRank, w.lemma]))

  const rankConflicts: RankConflict[] = []
  const fresh: TslRow[] = []
  for (const r of rows) {
    if (lemmas.has(r.lemma)) continue
    const takenBy = rankOwner.get(r.rank)
    if (takenBy) rankConflicts.push({ lemma: r.lemma, rank: r.rank, takenBy })
    else fresh.push(r)
  }

  // skipDuplicates still guards against a concurrent run inserting the same rows.
  const { count } = await db.word.createMany({
    data: fresh.map((r) => ({ lemma: r.lemma, tslRank: r.rank })),
    skipDuplicates: true,
  })
  return { inserted: count, skipped: rows.length - rankConflicts.length - count, rankConflicts }
}
