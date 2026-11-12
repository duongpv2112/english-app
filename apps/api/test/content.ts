import type { PrismaClient, Word } from '../src/db.ts'

/** Creates n enriched words (w1…wn, ranked 1…n), each with two example sentences. */
export async function seedWords(db: PrismaClient, n: number): Promise<Word[]> {
  const words: Word[] = []
  for (let i = 1; i <= n; i++) {
    words.push(
      await db.word.create({
        data: {
          lemma: `w${i}`,
          tslRank: i,
          pos: 'noun',
          ipa: `/w${i}/`,
          meaningVi: `nghĩa ${i}`,
          examples: {
            create: [
              { textEn: `First w${i}.`, textVi: `Một ${i}.` },
              { textEn: `Second w${i}.`, textVi: `Hai ${i}.` },
            ],
          },
        },
      }),
    )
  }
  return words
}
