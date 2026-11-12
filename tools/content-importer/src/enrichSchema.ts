import { z } from 'zod'

/** Shape requested from Claude (also sent as its JSON schema). Loose on purpose; see enrichedWordSchema. */
export const enrichOutputSchema = z.object({
  words: z.array(
    z.object({
      lemma: z.string(),
      pos: z.string(),
      ipa: z.string(),
      meaningVi: z.string(),
      examples: z.array(z.object({ textEn: z.string(), textVi: z.string() })),
    }),
  ),
})

const text = z.string().trim().min(1)

/** Strict check for one word before it is saved. */
export const enrichedWordSchema = z.object({
  lemma: text,
  pos: text,
  ipa: text,
  meaningVi: text,
  examples: z
    .array(z.object({ textEn: text, textVi: text }))
    .min(1)
    .max(2),
})

export type EnrichedWord = z.infer<typeof enrichedWordSchema>
