import { parseArgs as nodeParseArgs } from 'node:util'

export type Command =
  | { name: 'import-tsl'; file: string }
  | { name: 'enrich'; limit?: number }
  | { name: 'tts'; limit?: number }
  | { name: 'report'; format: 'md' | 'csv'; out: string; limit?: number }

export const USAGE = `Usage: pnpm importer <command>

  import-tsl <file.csv>                         Load the TSL word list (first column, in rank order)
  enrich [--limit N]                            Generate meaning, IPA and examples with Claude
  tts [--limit N]                               Generate audio with Azure TTS and upload it to R2
  report [--format md|csv] [--out FILE] [--limit N]
                                                Write a review file of the enriched words`

export class UsageError extends Error {
  constructor(problem: string) {
    super(`${problem}\n\n${USAGE}`)
    this.name = 'UsageError'
  }
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!/^[1-9]\d*$/.test(value)) throw new UsageError(`--limit must be a positive whole number`)
  return Number(value)
}

export function parseArgs(argv: string[]): Command {
  let parsed
  try {
    parsed = nodeParseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        limit: { type: 'string' },
        format: { type: 'string' },
        out: { type: 'string' },
      },
    })
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err))
  }
  const [name, ...rest] = parsed.positionals
  const { format, out } = parsed.values
  const limit = parseLimit(parsed.values.limit)

  switch (name) {
    case 'import-tsl': {
      const file = rest[0]
      if (!file) throw new UsageError('import-tsl needs the path of a CSV file')
      return { name, file }
    }
    case 'enrich':
    case 'tts':
      return { name, limit }
    case 'report': {
      const fmt = format ?? 'md'
      if (fmt !== 'md' && fmt !== 'csv') throw new UsageError('--format must be md or csv')
      return { name, format: fmt, out: out ?? `report.${fmt}`, limit }
    }
    case undefined:
      throw new UsageError('No command given')
    default:
      throw new UsageError(`Unknown command: ${name}`)
  }
}

/** Environment variables each command needs, checked before any work starts. */
export const REQUIRED_ENV: Record<Command['name'], string[]> = {
  'import-tsl': ['DATABASE_URL'],
  enrich: ['DATABASE_URL', 'ANTHROPIC_API_KEY'],
  tts: [
    'DATABASE_URL',
    'AZURE_SPEECH_KEY',
    'AZURE_SPEECH_REGION',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ],
  report: ['DATABASE_URL'],
}

export function requireEnv(env: NodeJS.ProcessEnv, names: string[]): Record<string, string> {
  const missing = names.filter((name) => !env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')}. ` +
        'Set them in tools/content-importer/.env (see .env.example).',
    )
  }
  return Object.fromEntries(names.map((name) => [name, env[name]!]))
}
