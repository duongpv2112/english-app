import {
  newCardState,
  startOfDay,
  startOfNextDay,
  type StudyCard,
  type StudyTodayResponse,
} from '@english-app/shared'
import type { Card, Example, PrismaClient, Word } from '../db.ts'
import { cardToState, stateToCardData } from './cardState.ts'

const MODE = 'RECOGNIZE' as const
const withWord = { word: { include: { examples: { orderBy: { id: 'asc' } } } } } as const

type CardWithWord = Card & { word: Word & { examples: Example[] } }

function toStudyCard(card: CardWithWord, audioBaseUrl: string | null): StudyCard {
  const audioUrl = (key: string | null) => (audioBaseUrl && key ? `${audioBaseUrl}/${key}` : null)
  return {
    cardId: card.id,
    mode: card.mode,
    isNew: card.state === 0,
    state: cardToState(card),
    word: {
      id: card.word.id,
      lemma: card.word.lemma,
      pos: card.word.pos,
      ipa: card.word.ipa,
      // Cards are only ever created for words that have a meaning.
      meaningVi: card.word.meaningVi ?? '',
      audioUrl: audioUrl(card.word.audioKey),
      examples: card.word.examples.map((e) => ({
        id: e.id,
        textEn: e.textEn,
        textVi: e.textVi,
        audioUrl: audioUrl(e.audioKey),
      })),
    },
  }
}

/**
 * Today's queue for the user: cards due before the end of their local day (earliest first),
 * then new cards by TSL rank, limited so that at most `newPerDay` cards are started per day.
 * Creates the card rows for today's new words, so every card it returns can be reviewed by id.
 */
export async function getStudyToday(
  db: PrismaClient,
  userId: string,
  now: Date,
  audioBaseUrl: string | null,
): Promise<StudyTodayResponse> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  const dayStart = startOfDay(now, user.timezone)
  const dayEnd = startOfNextDay(now, user.timezone)

  // Cards whose first ever review happened today have already used part of today's allowance.
  const introducedToday = await db.card.count({
    where: {
      userId,
      mode: MODE,
      logs: { some: { reviewedAt: { gte: dayStart } }, none: { reviewedAt: { lt: dayStart } } },
    },
  })
  const budget = Math.max(0, user.newPerDay - introducedToday)

  const findNewCards = () =>
    db.card.findMany({
      where: { userId, mode: MODE, state: 0 },
      orderBy: { word: { tslRank: 'asc' } },
      take: budget,
      include: withWord,
    })

  let newCards = budget > 0 ? await findNewCards() : []
  if (newCards.length < budget) {
    const words = await db.word.findMany({
      where: { meaningVi: { not: null }, cards: { none: { userId, mode: MODE } } },
      orderBy: { tslRank: 'asc' },
      take: budget - newCards.length,
      select: { id: true },
    })
    if (words.length > 0) {
      const fresh = stateToCardData(newCardState(now))
      await db.card.createMany({
        data: words.map((w) => ({ ...fresh, userId, wordId: w.id, mode: MODE, createdAt: now })),
        // Two requests at once (two tabs) may try to create the same card.
        skipDuplicates: true,
      })
      newCards = await findNewCards()
    }
  }

  const dueCards = await db.card.findMany({
    where: { userId, mode: MODE, state: { not: 0 }, due: { lt: dayEnd } },
    orderBy: [{ due: 'asc' }, { id: 'asc' }],
    include: withWord,
  })

  return {
    cards: [...dueCards, ...newCards].map((c) => toStudyCard(c, audioBaseUrl)),
    dueCount: dueCards.length,
    newCount: newCards.length,
    dayEndsAt: dayEnd.toISOString(),
  }
}
