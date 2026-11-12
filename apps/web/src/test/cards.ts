import { newCardState, type StudyCard } from '@english-app/shared'

/** A new study card for tests; `n` becomes its id and lemma. */
export function fakeCard(n: number, createdAt: Date): StudyCard {
  return {
    cardId: String(n),
    mode: 'RECOGNIZE',
    isNew: true,
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
