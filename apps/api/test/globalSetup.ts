// Starts an ephemeral Postgres for the test run unless TEST_DATABASE_URL is set (CI),
// then applies migrations (fresh database each run). Refuses to touch a database not named *_test.
import EmbeddedPostgres from 'embedded-postgres'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TestProject } from 'vitest/node'
import './db.ts'

// Other workspace packages reuse this setup, so run Prisma from the api package, not the cwd.
const apiDir = fileURLToPath(new URL('..', import.meta.url))

export default async function setup(project: TestProject) {
  let pg: EmbeddedPostgres | undefined
  let dir: string | undefined
  let url = process.env.TEST_DATABASE_URL

  if (!url) {
    dir = mkdtempSync(join(tmpdir(), 'english-app-pg-'))
    const port = 54330
    pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'english',
      password: 'english',
      port,
      persistent: false,
      onLog: () => {},
    })
    await pg.initialise()
    await pg.start()
    await pg.createDatabase('english_app_test')
    url = `postgres://english:english@localhost:${port}/english_app_test`
  }

  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run tests against non-test database: ${url}`)
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    shell: true,
  })

  project.provide('databaseUrl', url)

  return async () => {
    await pg?.stop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}
