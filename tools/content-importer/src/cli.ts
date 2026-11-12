import Anthropic from '@anthropic-ai/sdk'
import { createPrisma } from '@english-app/api/db'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs, REQUIRED_ENV, requireEnv, type Command } from './args.ts'
import { createAzureSynthesizer } from './azure.ts'
import { createClaudeEnricher, DEFAULT_MODEL } from './claude.ts'
import { enrichWords } from './enrich.ts'
import { createR2Uploader } from './r2.ts'
import { buildReport } from './report.ts'
import { importTsl, parseTslCsv } from './tsl.ts'
import { generateAudio } from './tts.ts'

// pnpm runs scripts from the repo root; INIT_CWD is the directory the user typed the command in.
const userDir = process.env.INIT_CWD ?? process.cwd()
const userPath = (path: string) => resolve(userDir, path)

async function run(command: Command, env: Record<string, string>): Promise<string> {
  const db = createPrisma(env.DATABASE_URL!)
  try {
    switch (command.name) {
      case 'import-tsl': {
        const lemmas = parseTslCsv(readFileSync(userPath(command.file), 'utf8'))
        const res = await importTsl(db, lemmas)
        return `import-tsl: created ${res.created}, skipped ${res.skipped}`
      }
      case 'enrich': {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
        const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
        const failedPath = userPath('failed.json')
        const res = await enrichWords(db, createClaudeEnricher(client, model), {
          limit: command.limit,
          failedPath,
        })
        return (
          `enrich: enriched ${res.enriched}, failed ${res.failed}` +
          (res.failed > 0 ? ` (see ${failedPath}; run enrich again to retry)` : '')
        )
      }
      case 'tts': {
        const synth = createAzureSynthesizer({
          key: env.AZURE_SPEECH_KEY!,
          region: env.AZURE_SPEECH_REGION!,
        })
        const upload = createR2Uploader({
          accountId: env.R2_ACCOUNT_ID!,
          accessKeyId: env.R2_ACCESS_KEY_ID!,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
          bucket: env.R2_BUCKET!,
        })
        const res = await generateAudio(db, synth, upload, { limit: command.limit })
        return (
          `tts: ${res.words} words, ${res.examples} examples, failed ${res.failed}` +
          (res.failed > 0 ? ' (run tts again to retry)' : '')
        )
      }
      case 'report': {
        const out = userPath(command.out)
        writeFileSync(out, await buildReport(db, { format: command.format, limit: command.limit }))
        return `report: wrote ${out}`
      }
    }
  } finally {
    await db.$disconnect()
  }
}

try {
  const command = parseArgs(process.argv.slice(2))
  const env = requireEnv(process.env, REQUIRED_ENV[command.name])
  console.log(await run(command, env))
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
}
