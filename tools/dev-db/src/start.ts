// Local Postgres 17 for development, without Docker.
// Data lives in <repo>/.data/pg; creates english_app and english_app_test on first run.
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dataDir = fileURLToPath(new URL('../../../.data/pg', import.meta.url))
const port = Number(process.env.PGPORT ?? 5432)
const databases = ['english_app', 'english_app_test']

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'english',
  password: 'english',
  port,
  persistent: true,
})

if (!existsSync(dataDir)) await pg.initialise()
await pg.start()

const client = pg.getPgClient()
await client.connect()
const { rows } = await client.query<{ datname: string }>('SELECT datname FROM pg_database')
const existing = new Set(rows.map((r) => r.datname))
for (const db of databases) {
  if (!existing.has(db)) await pg.createDatabase(db)
}
await client.end()

console.log(`Postgres running on port ${port}: ${databases.join(', ')} (Ctrl+C to stop)`)

const stop = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
