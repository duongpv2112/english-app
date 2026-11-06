import { createPrisma } from './db.ts'
import { seedUser } from './seed.ts'

const { DATABASE_URL, SEED_EMAIL, SEED_PASSWORD } = process.env
if (!DATABASE_URL || !SEED_EMAIL || !SEED_PASSWORD) {
  console.error('DATABASE_URL, SEED_EMAIL and SEED_PASSWORD must be set')
  process.exit(1)
}

const db = createPrisma(DATABASE_URL)
const user = await seedUser(db, SEED_EMAIL, SEED_PASSWORD)
console.log(`Seeded user ${user.email}`)
await db.$disconnect()
