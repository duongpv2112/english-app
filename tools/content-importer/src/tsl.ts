import type { PrismaClient } from '@english-app/api/db'

const HEADER_CELLS = new Set(['headword', 'word', 'lemma'])

/**
 * Reads the lemmas from a TSL word-list CSV, in file order (which is the TSL rank).
 * Only the first column is used; a header row and repeated words are dropped.
 */
export function parseTslCsv(text: string): string[] {
  const lemmas: string[] = []
  const seen = new Set<string>()
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  lines.forEach((line, i) => {
    const cell = (line.split(',')[0] ?? '')
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim()
      .toLowerCase()
    if (!cell || seen.has(cell)) return
    if (i === 0 && HEADER_CELLS.has(cell)) return
    seen.add(cell)
    lemmas.push(cell)
  })
  return lemmas
}

/** Inserts the lemmas as words ranked by position. Words that already exist are left untouched. */
export async function importTsl(
  db: PrismaClient,
  lemmas: string[],
): Promise<{ created: number; skipped: number }> {
  const { count } = await db.word.createMany({
    data: lemmas.map((lemma, i) => ({ lemma, tslRank: i + 1 })),
    skipDuplicates: true,
  })
  return { created: count, skipped: lemmas.length - count }
}
