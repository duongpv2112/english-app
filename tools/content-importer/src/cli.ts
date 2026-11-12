import Anthropic from '@anthropic-ai/sdk'
import { createPrisma, type PrismaClient } from '@english-app/api/db'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { createClaudeEnricher } from './claudeEnricher.ts'
import { enrich } from './enrich.ts'
import { importTsl, parseTslCsv } from './importTsl.ts'
import { buildReport } from './report.ts'

type Env = Record<string, string | undefined>

const USAGE = `Usage:
  cli import-tsl <csv>
  cli enrich [--limit N]
  cli report [--since YYYY-MM-DD] [--out report.md]`

const DEFAULT_MODEL = 'claude-opus-5-5'

class UsageError extends Error {}

export function requireEnv(env: Env, names: string[]): Record<string, string> {
  const missing = names.filter((n) => !env[n])
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  }
  return Object.fromEntries(names.map((n) => [n, env[n]!]))
}

async function withDb<T>(url: string, fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db = createPrisma(url)
  try {
    return await fn(db)
  } finally {
    await db.$disconnect()
  }
}

async function importTslCommand(args: string[], env: Env) {
  const { positionals } = parseArgs({ args, allowPositionals: true })
  const file = positionals[0]
  if (!file) throw new UsageError('import-tsl needs a CSV file')
  const { DATABASE_URL } = requireEnv(env, ['DATABASE_URL'])
  const rows = parseTslCsv(readFileSync(file, 'utf8'))
  const { inserted, skipped } = await withDb(DATABASE_URL, (db) => importTsl(db, rows))
  console.log(`Inserted ${inserted}, skipped ${skipped}`)
}

async function enrichCommand(args: string[], env: Env) {
  const { values } = parseArgs({ args, options: { limit: { type: 'string' } } })
  const limit = values.limit === undefined ? undefined : Number(values.limit)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new UsageError('--limit must be a positive integer')
  }
  const { DATABASE_URL, ANTHROPIC_API_KEY } = requireEnv(env, ['DATABASE_URL', 'ANTHROPIC_API_KEY'])
  const model = env.ENRICH_MODEL || DEFAULT_MODEL
  const enricher = createClaudeEnricher(new Anthropic({ apiKey: ANTHROPIC_API_KEY }), model)
  const { enriched, failed } = await withDb(DATABASE_URL, (db) =>
    enrich(db, enricher, {
      limit,
      onBatch: (done, total) => console.log(`${done}/${total} words processed`),
    }),
  )
  writeFileSync('failed.json', JSON.stringify(failed, null, 2) + '\n')
  console.log(
    `Enriched ${enriched}, failed ${failed.length}${failed.length ? ' (see failed.json)' : ''}`,
  )
}

async function reportCommand(args: string[], env: Env) {
  const { values } = parseArgs({
    args,
    options: { since: { type: 'string' }, out: { type: 'string', default: 'report.md' } },
  })
  let since: Date | undefined
  if (values.since !== undefined) {
    since = new Date(`${values.since}T00:00:00`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.since) || Number.isNaN(since.getTime())) {
      throw new UsageError('--since must be a date like 2026-11-12')
    }
  }
  const { DATABASE_URL } = requireEnv(env, ['DATABASE_URL'])
  const md = await withDb(DATABASE_URL, (db) => buildReport(db, { since }))
  writeFileSync(values.out, md)
  console.log(`Wrote ${values.out}`)
}

const COMMANDS: Record<string, (args: string[], env: Env) => Promise<void>> = {
  'import-tsl': importTslCommand,
  enrich: enrichCommand,
  report: reportCommand,
}

export async function main(argv: string[], env: Env): Promise<number> {
  const [name, ...args] = argv
  const command = name ? COMMANDS[name] : undefined
  if (!command) {
    console.error(USAGE)
    return 1
  }
  try {
    await command(args, env)
    return 0
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    if (e instanceof UsageError) console.error(USAGE)
    return 1
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2), process.env)
