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
    skip_empty_lines: true,
    relax_column_count: true,
  })
  const [header, ...data] = records
  const columns = (header ?? []).map((c) => c.trim().toLowerCase())
  const wordCol = columns.findIndex((c) => c === 'word' || c === 'lemma')
  if (wordCol === -1) throw new Error('CSV header must have a "word" or "lemma" column')
  const rankCol = columns.indexOf('rank')

  const seen = new Set<string>()
  const rows: TslRow[] = []
  data.forEach((record, i) => {
    const lemma = (record[wordCol] ?? '').trim().toLowerCase()
    if (!lemma || seen.has(lemma)) return
    seen.add(lemma)
    const rank = rankCol === -1 ? i + 1 : Number(record[rankCol])
    if (!Number.isInteger(rank) || rank < 1) {
      throw new Error(`Invalid rank for "${lemma}": ${record[rankCol]}`)
    }
    rows.push({ lemma, rank })
  })
  return rows
}

/** Inserts words that are not there yet; a lemma or rank that already exists is skipped. */
export async function importTsl(
  db: PrismaClient,
  rows: TslRow[],
): Promise<{ inserted: number; skipped: number }> {
  const { count } = await db.word.createMany({
    data: rows.map((r) => ({ lemma: r.lemma, tslRank: r.rank })),
    skipDuplicates: true,
  })
  return { inserted: count, skipped: rows.length - count }
}
