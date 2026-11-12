import {
  cardStateToJson,
  newCardState,
  type StudyCard,
  type StudyTodayResponse,
} from '@english-app/shared'

/** A new study card for word `lemma`, created at `at`. */
export function fakeCard(lemma: string, at: Date): StudyCard {
  return {
    cardId: `card-${lemma}`,
    isNew: true,
    state: cardStateToJson(newCardState(at)),
    word: {
      id: `word-${lemma}`,
      lemma,
      pos: 'noun',
      ipa: `/${lemma}/`,
      meaningVi: `nghĩa ${lemma}`,
      examples: [{ id: `ex-${lemma}`, textEn: `The ${lemma}.`, textVi: `Câu ${lemma}.` }],
    },
  }
}

export function fakeToday(lemmas: string[], now: Date): StudyTodayResponse {
  return {
    cards: lemmas.map((l) => fakeCard(l, now)),
    dueCount: 0,
    newCount: lemmas.length,
    dayEnd: new Date(now.getTime() + 12 * 3600_000).toISOString(),
  }
}
