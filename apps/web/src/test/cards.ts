import { newCardState, type CardMode, type StudyCard } from '@english-app/shared'

/** A new study card for tests; `n` becomes its id and lemma. */
export function fakeCard(n: number, createdAt: Date, mode: CardMode = 'RECOGNIZE'): StudyCard {
  return {
    cardId: String(n),
    mode,
    isNew: mode === 'RECOGNIZE',
    state: newCardState(createdAt),
    word: {
      id: `word${n}`,
      lemma: `w${n}`,
      pos: 'noun',
      ipa: `/w${n}/`,
      meaningVi: `nghĩa ${n}`,
      audioUrl: null,
      examples: [],
    },
  }
}
