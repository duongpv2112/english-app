import { loginRequestSchema } from '@english-app/shared'
import type { PrismaClient, User } from '@prisma/client'
import argon2 from 'argon2'

/** Creates the single app user, or resets its password if it already exists. */
export async function seedUser(db: PrismaClient, email: string, password: string): Promise<User> {
  const normalized = loginRequestSchema.shape.email.parse(email)
  const passwordHash = await argon2.hash(password)
  return db.user.upsert({
    where: { email: normalized },
    create: { email: normalized, passwordHash },
    update: { passwordHash },
  })
}
