import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1).max(max)

/** A correction to a word's card content (the "Báo sai" button). The word itself cannot change. */
export const wordPatchSchema = z
  .object({
    pos: text(30).optional(),
    ipa: text(100).optional(),
    meaningVi: text(300).optional(),
    examples: z
      .array(
        z.object({
          id: z.string().min(1),
          textEn: text(300).optional(),
          textVi: text(300).optional(),
        }),
      )
      .min(1)
      .max(10)
      .optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), 'Nothing to change')
export type WordPatch = z.infer<typeof wordPatchSchema>
