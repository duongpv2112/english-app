import { z } from 'zod'

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
})

export type LoginRequest = z.infer<typeof loginRequestSchema>

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
})

export type MeResponse = z.infer<typeof meResponseSchema>
