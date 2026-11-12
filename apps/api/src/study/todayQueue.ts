import {
  cardStateToJson,
  localDayRange,
  newCardState,
  type StudyCard,
  type StudyTodayResponse,
} from '@english-app/shared'
import type { Prisma, PrismaClient } from '@prisma/client'
import { cardToState, stateToCardData } from './cardState.ts'

const cardInclude = {
  word: { include: { examples: { orderBy: { id: 'asc' } } } },
} satisfies Prisma.CardInclude

type CardWithWord = Prisma.CardGetPayload<{ include: typeof cardInclude }>

function toStudyCard(card: CardWithWord): StudyCard {
  const w = card.word
  return {
    cardId: card.id,
    isNew: card.reps === 0,
    state: cardStateToJson(cardToState(card)),
    word: {
      id: w.id,
      lemma: w.lemma,
      // Only enriched words reach the queue, so these are set.
      pos: w.pos ?? '',
      ipa: w.ipa ?? '',
      meaningVi: w.meaningVi ?? '',
      examples: w.examples.map((e) => ({ id: e.id, textEn: e.textEn, textVi: e.textVi })),
    },
  }
}

/** Today's RECOGNIZE queue: due cards by due time, then up to the day's remaining new words. */
export async function buildTodayQueue(
  db: PrismaClient,
  userId: string,
  now: Date,
): Promise<StudyTodayResponse> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  const { start, end } = localDayRange(now, user.timezone)

  // New words first reviewed today count against today's limit.
  const introducedToday = await db.card.count({
    where: {
      userId,
      mode: 'RECOGNIZE',
      logs: { some: { reviewedAt: { gte: start } }, none: { reviewedAt: { lt: start } } },
    },
  })
  const limit = Math.max(0, user.newPerDay - introducedToday)

  const newWords = await db.word.findMany({
    where: {
      meaningVi: { not: null },
      cards: { none: { userId, mode: 'RECOGNIZE', reps: { gt: 0 } } },
    },
    orderBy: { tslRank: 'asc' },
    take: limit,
    select: { id: true },
  })
  const fresh = newCardState(now)
  await db.card.createMany({
    data: newWords.map((w) => ({
      userId,
      wordId: w.id,
      mode: 'RECOGNIZE' as const,
      ...stateToCardData(fresh),
    })),
    skipDuplicates: true,
  })

  const [due, created] = await Promise.all([
    db.card.findMany({
      where: { userId, mode: 'RECOGNIZE', reps: { gt: 0 }, due: { lt: end } },
      orderBy: { due: 'asc' },
      include: cardInclude,
    }),
    db.card.findMany({
      where: { userId, mode: 'RECOGNIZE', wordId: { in: newWords.map((w) => w.id) } },
      orderBy: { word: { tslRank: 'asc' } },
      include: cardInclude,
    }),
  ])

  return {
    cards: [...due, ...created].map(toStudyCard),
    dueCount: due.length,
    newCount: created.length,
    dayEnd: end.toISOString(),
  }
}
