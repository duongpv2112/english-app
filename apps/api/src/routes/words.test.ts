import { studyWordSchema } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { login, sessionCookie, testApp } from '../../test/app.ts'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import type { Word } from '../db.ts'
import { seedUser } from '../seed.ts'

const db = testDb()

describe('PATCH /api/words/:id', () => {
  let app: FastifyInstance
  let cookies: Record<string, string>
  let words: Word[]

  beforeEach(async () => {
    await resetDb(db)
    await seedUser(db, 'me@mail.com', 'secret123')
    words = await seedWords(db, 2)
    await db.example.updateMany({ data: { audioKey: 'audio/x.mp3', voice: 'en-GB-SoniaNeural' } })
    app = await testApp({ audioBaseUrl: 'https://cdn.test' })
    cookies = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
  })
  afterEach(() => app.close())
  afterAll(() => db.$disconnect())

  const patch = (id: string, payload: unknown, withCookies = true) =>
    app.inject({
      method: 'PATCH',
      url: `/api/words/${id}`,
      cookies: withCookies ? cookies : undefined,
      payload: payload as object,
    })
  const examplesOf = (wordId: string) =>
    db.example.findMany({ where: { wordId }, orderBy: { id: 'asc' } })

  it('needs a session → 401', async () => {
    expect((await patch(words[0]!.id, { meaningVi: 'x' }, false)).statusCode).toBe(401)
  })

  it('updates meaning, IPA and an example; returns the word', async () => {
    const [first] = await examplesOf(words[0]!.id)
    const res = await patch(words[0]!.id, {
      meaningVi: ' hóa đơn ',
      ipa: '/ˈɪnvɔɪs/',
      examples: [{ id: first!.id, textVi: 'Bản dịch mới.' }],
    })
    expect(res.statusCode).toBe(200)
    const body = studyWordSchema.parse(res.json())
    expect(body).toMatchObject({ id: words[0]!.id, meaningVi: 'hóa đơn', ipa: '/ˈɪnvɔɪs/' })
    expect(body.examples.find((e) => e.id === first!.id)).toMatchObject({
      textVi: 'Bản dịch mới.',
      audioUrl: 'https://cdn.test/audio/x.mp3',
    })
    const saved = await db.word.findUniqueOrThrow({ where: { id: words[0]!.id } })
    expect([saved.meaningVi, saved.ipa, saved.pos]).toEqual(['hóa đơn', '/ˈɪnvɔɪs/', 'noun'])
  })

  it('changing an example sentence clears its audio; changing only the translation keeps it', async () => {
    const [first, second] = await examplesOf(words[0]!.id)
    await patch(words[0]!.id, {
      examples: [
        { id: first!.id, textEn: 'A new sentence.' },
        { id: second!.id, textEn: second!.textEn, textVi: 'Khác.' },
      ],
    })
    const [a, b] = await examplesOf(words[0]!.id)
    expect([a!.textEn, a!.audioKey, a!.voice]).toEqual(['A new sentence.', null, null])
    expect([b!.textVi, b!.audioKey]).toEqual(['Khác.', 'audio/x.mp3'])
  })

  it('unknown word → 404 NOT_FOUND', async () => {
    const res = await patch('missing', { meaningVi: 'x' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })

  it('an example of another word → 400 and nothing changes', async () => {
    const [other] = await examplesOf(words[1]!.id)
    const res = await patch(words[0]!.id, {
      meaningVi: 'đổi',
      examples: [{ id: other!.id, textVi: 'x' }],
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
    expect((await db.word.findUniqueOrThrow({ where: { id: words[0]!.id } })).meaningVi).toBe(
      'nghĩa 1',
    )
    expect((await db.example.findUniqueOrThrow({ where: { id: other!.id } })).textVi).toBe('Một 2.')
  })

  it('invalid body → 400 VALIDATION_ERROR', async () => {
    for (const bad of [{}, { meaningVi: '  ' }, { lemma: 'other' }]) {
      const res = await patch(words[0]!.id, bad)
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_ERROR')
    }
  })
})
