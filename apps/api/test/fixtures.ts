import type { PrismaClient, User } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { seedUser } from '../src/seed.ts'
import { login, sessionCookie } from './app.ts'

/** Words w1..wn with ranks 1..n; enriched ones get content and two examples. */
export async function seedWords(
  db: PrismaClient,
  n: number,
  { enriched = true, fromRank = 1 } = {},
) {
  for (let i = fromRank; i < fromRank + n; i++) {
    await db.word.create({
      data: {
        lemma: `w${i}`,
        tslRank: i,
        ...(enriched && {
          pos: 'noun',
          ipa: `/w${i}/`,
          meaningVi: `nghĩa ${i}`,
          enrichedAt: new Date(),
          examples: {
            create: [
              { textEn: `Example one of w${i}.`, textVi: `Ví dụ một của w${i}.` },
              { textEn: `Example two of w${i}.`, textVi: `Ví dụ hai của w${i}.` },
            ],
          },
        }),
      },
    })
  }
}

export async function seedTestUser(db: PrismaClient): Promise<User> {
  return seedUser(db, 'me@mail.com', 'secret123')
}

/** Seeds the user and logs in; returns the cookies to pass to `inject`. */
export async function loggedInUser(app: FastifyInstance, db: PrismaClient) {
  const user = await seedTestUser(db)
  const cookies = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
  return { user, cookies }
}
