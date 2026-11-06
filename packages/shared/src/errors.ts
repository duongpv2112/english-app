import { z } from 'zod'

export const errorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const

export type ErrorCode = (typeof errorCodes)[number]

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(errorCodes),
    message: z.string(),
  }),
})

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
