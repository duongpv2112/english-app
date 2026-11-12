import { z } from 'zod'
import type { CardState } from './srs.ts'

export const cardStateJsonSchema = z.object({
  due: z.iso.datetime(),
  stability: z.number(),
  difficulty: z.number(),
  scheduledDays: z.number().int(),
  learningSteps: z.number().int(),
  reps: z.number().int(),
  lapses: z.number().int(),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  lastReview: z.iso.datetime().nullable(),
})

export type CardStateJson = z.infer<typeof cardStateJsonSchema>

export function parseCardState(json: CardStateJson): CardState {
  return {
    ...json,
    due: new Date(json.due),
    lastReview: json.lastReview ? new Date(json.lastReview) : null,
  }
}

export function cardStateToJson(s: CardState): CardStateJson {
  return { ...s, due: s.due.toISOString(), lastReview: s.lastReview?.toISOString() ?? null }
}

export const studyCardSchema = z.object({
  cardId: z.string(),
  isNew: z.boolean(),
  state: cardStateJsonSchema,
  word: z.object({
    id: z.string(),
    lemma: z.string(),
    pos: z.string(),
    ipa: z.string(),
    meaningVi: z.string(),
    examples: z.array(z.object({ id: z.string(), textEn: z.string(), textVi: z.string() })),
  }),
})

export type StudyCard = z.infer<typeof studyCardSchema>

export const studyTodayResponseSchema = z.object({
  cards: z.array(studyCardSchema),
  dueCount: z.number().int(),
  newCount: z.number().int(),
  dayEnd: z.iso.datetime(),
})

export type StudyTodayResponse = z.infer<typeof studyTodayResponseSchema>
