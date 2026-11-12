import type { PrismaClient } from '@english-app/api/db'

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Lists enriched words with their examples, lowest TSL rank first, for a manual review pass. */
export async function buildReport(
  db: PrismaClient,
  opts: { format: 'md' | 'csv'; limit?: number },
): Promise<string> {
  const words = await db.word.findMany({
    where: { meaningVi: { not: null } },
    orderBy: { tslRank: 'asc' },
    take: opts.limit,
    include: { examples: { orderBy: { id: 'asc' } } },
  })

  if (opts.format === 'csv') {
    const header = 'rank,lemma,pos,ipa,meaningVi,example1En,example1Vi,example2En,example2Vi'
    const rows = words.map((w) =>
      [
        w.tslRank,
        w.lemma,
        w.pos,
        w.ipa,
        w.meaningVi,
        w.examples[0]?.textEn,
        w.examples[0]?.textVi,
        w.examples[1]?.textEn,
        w.examples[1]?.textVi,
      ]
        .map(csvCell)
        .join(','),
    )
    return [header, ...rows].join('\n') + '\n'
  }

  return words
    .map(
      (w) =>
        `## ${w.tslRank}. ${w.lemma} (${w.pos}) ${w.ipa}\n\n${w.meaningVi}\n\n` +
        w.examples.map((e) => `- ${e.textEn} — ${e.textVi}\n`).join(''),
    )
    .join('\n')
}
