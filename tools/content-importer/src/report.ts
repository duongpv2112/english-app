import type { PrismaClient } from '@english-app/api/db'

function cell(s: string | null): string {
  return (s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

/** Markdown table of enriched words (optionally only those enriched since a date), for review. */
export async function buildReport(db: PrismaClient, opts: { since?: Date }): Promise<string> {
  const words = await db.word.findMany({
    where: { enrichedAt: opts.since ? { gte: opts.since } : { not: null } },
    orderBy: { tslRank: 'asc' },
    include: { examples: { orderBy: { id: 'asc' } } },
  })
  const rows = words.map((w) => {
    const examples = w.examples.map((e) => `${cell(e.textEn)} — ${cell(e.textVi)}`).join('<br>')
    return `| ${w.tslRank} | ${cell(w.lemma)} | ${cell(w.pos)} | ${cell(w.ipa)} | ${cell(w.meaningVi)} | ${examples} |`
  })
  return [
    '# Content report',
    '',
    `${words.length} words`,
    '',
    '| Rank | Word | POS | IPA | Nghĩa | Ví dụ |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}
