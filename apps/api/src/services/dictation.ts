import {
  gradeDictation,
  keyWordMissed,
  type DictationAttemptInput,
  type DictationBatchResponse,
  type DictationSessionResponse,
} from '@english-app/shared'
import type { PrismaClient } from '../db.ts'

export const DICTATION_SESSION_SIZE = 10

/**
 * Sentences to practise: examples (with audio) of words the user has reviewed at least once.
 * Sentences never practised come first, then the ones that went worst last time.
 */
export async function getDictationSession(
  db: PrismaClient,
  userId: string,
  audioBaseUrl: string | null,
): Promise<DictationSessionResponse> {
  // Without a place to load audio from there is nothing to listen to.
  if (!audioBaseUrl) return { items: [] }

  const examples = await db.example.findMany({
    where: {
      audioKey: { not: null },
      word: { cards: { some: { userId, reps: { gt: 0 } } } },
    },
    include: {
      word: { select: { id: true, lemma: true, tslRank: true } },
      dictations: {
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { score: true },
      },
    },
  })

  const ranked = examples
    .map((example) => ({ example, lastScore: example.dictations[0]?.score ?? null }))
    .sort((a, b) => {
      // Never practised sorts before any score.
      const byScore = (a.lastScore ?? -1) - (b.lastScore ?? -1)
      if (byScore !== 0) return byScore
      const byRank = a.example.word.tslRank - b.example.word.tslRank
      if (byRank !== 0) return byRank
      return a.example.id < b.example.id ? -1 : 1
    })

  return {
    items: ranked.slice(0, DICTATION_SESSION_SIZE).map(({ example }) => ({
      exampleId: example.id,
      wordId: example.word.id,
      lemma: example.word.lemma,
      textEn: example.textEn,
      textVi: example.textVi,
      audioUrl: `${audioBaseUrl}/${example.audioKey}`,
    })),
  }
}

/**
 * Grades and stores dictation attempts. The client's own grading is not trusted or even sent.
 * When the sentence's key word was not heard correctly, that word's listen-and-type card is
 * brought forward to now so it gets practised again soon; its FSRS state is left untouched.
 */
export async function applyDictationAttempts(
  db: PrismaClient,
  userId: string,
  attempts: DictationAttemptInput[],
  now: Date,
): Promise<DictationBatchResponse> {
  let duplicates = 0
  const unique = new Map<string, DictationAttemptInput>()
  for (const attempt of attempts) {
    if (unique.has(attempt.id)) duplicates++
    else unique.set(attempt.id, attempt)
  }

  return db.$transaction(async (tx) => {
    const stored = await tx.dictationAttempt.findMany({
      where: { id: { in: [...unique.keys()] } },
      select: { id: true },
    })
    const storedIds = new Set(stored.map((a) => a.id))

    const examples = await tx.example.findMany({
      where: { id: { in: [...new Set([...unique.values()].map((a) => a.exampleId))] } },
      include: { word: { select: { id: true, lemma: true } } },
    })
    const exampleById = new Map(examples.map((e) => [e.id, e]))

    const rejected: string[] = []
    const results: DictationBatchResponse['results'] = []
    const missedWordIds = new Set<string>()

    for (const attempt of unique.values()) {
      if (storedIds.has(attempt.id)) {
        duplicates++
        continue
      }
      const example = exampleById.get(attempt.exampleId)
      if (!example) {
        rejected.push(attempt.id)
        continue
      }
      const { score, diff } = gradeDictation(example.textEn, attempt.input)
      await tx.dictationAttempt.create({
        data: {
          id: attempt.id,
          userId,
          exampleId: example.id,
          input: attempt.input,
          score,
          diff,
          // A client clock that runs ahead must not put an attempt in the future.
          createdAt: new Date(Math.min(new Date(attempt.createdAt).getTime(), now.getTime())),
        },
      })
      results.push({ id: attempt.id, score, diff })
      if (keyWordMissed(example.word.lemma, diff) === true) missedWordIds.add(example.word.id)
    }

    if (missedWordIds.size > 0) {
      await tx.card.updateMany({
        where: {
          userId,
          mode: 'LISTEN_TYPE',
          wordId: { in: [...missedWordIds] },
          // Only ever earlier: a card that is already due keeps its place in the queue.
          due: { gt: now },
        },
        data: { due: now },
      })
    }

    return { applied: results.length, duplicates, rejected, results }
  })
}
