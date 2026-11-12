import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 hex characters (32 bytes)'),
  WEB_DIST_DIR: z.string().min(1).optional(),
  AUDIO_BASE_URL: z
    .url({ protocol: /^https?$/, error: 'must be an http(s) URL' })
    .transform((url) => url.replace(/\/+$/, ''))
    .optional(),
})

export type Config = {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  databaseUrl: string
  sessionSecret: Buffer
  webDistDir: string | null
  /** Public address of the audio bucket; audio keys are appended to it. Null means no audio. */
  audioBaseUrl: string | null
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment: ${problems}`)
  }
  const e = result.data
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: Buffer.from(e.SESSION_SECRET, 'hex'),
    webDistDir: e.WEB_DIST_DIR ?? null,
    audioBaseUrl: e.AUDIO_BASE_URL ?? null,
  }
}
