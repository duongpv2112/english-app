import { describe, expect, it } from 'vitest'
import { loginRequestSchema } from './index.ts'

describe('loginRequestSchema', () => {
  it('normalizes email', () => {
    expect(loginRequestSchema.parse({ email: '  Me@Mail.com ', password: 'x' }).email).toBe(
      'me@mail.com',
    )
  })

  it('rejects missing password', () => {
    expect(loginRequestSchema.safeParse({ email: 'me@mail.com' }).success).toBe(false)
  })

  it('rejects invalid email', () => {
    expect(loginRequestSchema.safeParse({ email: 'abc', password: 'x' }).success).toBe(false)
  })
})
