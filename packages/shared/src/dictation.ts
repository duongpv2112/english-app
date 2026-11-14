// Grading rules for dictation, shared so the client can show a result at once and the server can
// grade again with the same rules before storing it.
import { z } from 'zod'

/** Contractions and their full forms count as the same words. Irregular ones are listed here. */
const CONTRACTIONS: Record<string, string> = {
  "won't": 'will not',
  "can't": 'can not',
  cannot: 'can not',
  "shan't": 'shall not',
  "let's": 'let us',
  "i'm": 'i am',
  // 's is only expanded after these words; elsewhere it is a possessive ("the company's plan").
  "it's": 'it is',
  "he's": 'he is',
  "she's": 'she is',
  "that's": 'that is',
  "there's": 'there is',
  "here's": 'here is',
  "what's": 'what is',
  "who's": 'who is',
  "where's": 'where is',
  "how's": 'how is',
}

/** Regular endings: [ending, replacement]. 'd is read as "would". */
const ENDINGS: [string, string][] = [
  ["n't", ' not'],
  ["'re", ' are'],
  ["'ve", ' have'],
  ["'ll", ' will'],
  ["'d", ' would'],
]

function expand(word: string): string {
  const listed = CONTRACTIONS[word]
  if (listed) return listed
  for (const [ending, replacement] of ENDINGS) {
    if (word.length > ending.length && word.endsWith(ending)) {
      return word.slice(0, -ending.length) + replacement
    }
  }
  return word
}

/** The words of a sentence in comparable form: lower case, no punctuation, contractions expanded. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .split(' ')
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter((word) => word.length > 0)
    .flatMap((word) => expand(word).split(' '))
}

export const diffTokenSchema = z.object({
  /** correct: heard right. wrong: another word typed in its place. missing: not typed. extra: typed but not said. */
  type: z.enum(['correct', 'wrong', 'missing', 'extra']),
  expected: z.string().nullable(),
  actual: z.string().nullable(),
})
export type DiffToken = z.infer<typeof diffTokenSchema>

/** Index pairs of a longest common subsequence of the two word lists. */
function commonWords(a: string[], b: string[]): [number, number][] {
  const rows = a.length + 1
  const cols = b.length + 1
  const length = new Uint16Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      length[i * cols + j] =
        a[i] === b[j]
          ? length[(i + 1) * cols + j + 1]! + 1
          : Math.max(length[(i + 1) * cols + j]!, length[i * cols + j + 1]!)
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) pairs.push([i++, j++])
    else if (length[(i + 1) * cols + j]! >= length[i * cols + j + 1]!) i++
    else j++
  }
  return pairs
}

/**
 * Compares what was typed with the sentence that was said, word by word.
 * The score is the share of the sentence's words that were typed correctly, in order.
 */
export function gradeDictation(
  expected: string,
  input: string,
): { score: number; diff: DiffToken[] } {
  const want = normalizeWords(expected)
  const got = normalizeWords(input)
  const diff: DiffToken[] = []

  // Between two matched words: pair up what is left on both sides as substitutions,
  // then report whatever one side has more of.
  const mismatch = (wantEnd: number, gotEnd: number) => {
    while (i < wantEnd && j < gotEnd) {
      diff.push({ type: 'wrong', expected: want[i++]!, actual: got[j++]! })
    }
    while (i < wantEnd) diff.push({ type: 'missing', expected: want[i++]!, actual: null })
    while (j < gotEnd) diff.push({ type: 'extra', expected: null, actual: got[j++]! })
  }

  let i = 0
  let j = 0
  const matches = commonWords(want, got)
  for (const [wi, gj] of matches) {
    mismatch(wi, gj)
    diff.push({ type: 'correct', expected: want[i++]!, actual: got[j++]! })
  }
  mismatch(want.length, got.length)

  return { score: want.length === 0 ? 0 : matches.length / want.length, diff }
}

/** Whether the typed answer to a listen-and-type card is the word. */
export function isTypedCorrect(lemma: string, input: string): boolean {
  const want = normalizeWords(lemma)
  const got = normalizeWords(input)
  return want.length > 0 && want.join(' ') === got.join(' ')
}

/**
 * Whether the sentence's key word (the word being learned, possibly inflected) was not heard
 * correctly. Null when no word of the sentence looks like a form of the lemma, e.g. "sent" for
 * "send": then nothing can be said about it.
 */
export function keyWordMissed(lemma: string, diff: DiffToken[]): boolean | null {
  const word = lemma.trim().toLowerCase()
  // "apply" → "applied", "manage" → "managing": compare on the stem.
  const stem = word.length > 3 && /[ey]$/.test(word) ? word.slice(0, -1) : word
  if (!stem) return null
  const forms = diff.filter((token) => token.expected?.startsWith(stem))
  if (forms.length === 0) return null
  return forms.some((token) => token.type !== 'correct')
}

export const dictationItemSchema = z.object({
  exampleId: z.string(),
  wordId: z.string(),
  lemma: z.string(),
  textEn: z.string(),
  textVi: z.string(),
  audioUrl: z.string(),
})
export type DictationItem = z.infer<typeof dictationItemSchema>

export const dictationSessionResponseSchema = z.object({ items: z.array(dictationItemSchema) })
export type DictationSessionResponse = z.infer<typeof dictationSessionResponseSchema>

export const dictationAttemptInputSchema = z.object({
  /** Generated by the client, so a retried request is not stored twice. */
  id: z.uuid(),
  exampleId: z.string().min(1),
  input: z.string().max(500),
  createdAt: z.iso.datetime(),
})
export type DictationAttemptInput = z.infer<typeof dictationAttemptInputSchema>

export const dictationBatchRequestSchema = z.object({
  attempts: z.array(dictationAttemptInputSchema).min(1).max(100),
})

export const dictationBatchResponseSchema = z.object({
  applied: z.number(),
  duplicates: z.number(),
  /** Ids of attempts whose sentence does not exist. */
  rejected: z.array(z.string()),
  /** The server's grading of each attempt it stored. */
  results: z.array(z.object({ id: z.string(), score: z.number(), diff: z.array(diffTokenSchema) })),
})
export type DictationBatchResponse = z.infer<typeof dictationBatchResponseSchema>
