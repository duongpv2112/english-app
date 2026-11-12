import { resetDb, testDb } from '@english-app/api/test/db'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { generateAudio, type Synthesizer, type Uploader } from './tts.ts'

describe('generateAudio', () => {
  const db = testDb()
  let synthCalls: [string, string][]
  let uploaded: Map<string, Uint8Array>
  const synth: Synthesizer = async (text, voice) => {
    synthCalls.push([text, voice])
    return new TextEncoder().encode(text)
  }
  const upload: Uploader = async (key, body) => void uploaded.set(key, body)

  async function seedWord(lemma: string, tslRank: number) {
    const word = await db.word.create({
      data: { lemma, tslRank, pos: 'noun', ipa: '/x/', meaningVi: 'nghĩa' },
    })
    // Created one by one so the id order (which decides the voice) is predictable.
    const first = await db.example.create({
      data: { wordId: word.id, textEn: `First ${lemma}.`, textVi: 'Một.' },
    })
    const second = await db.example.create({
      data: { wordId: word.id, textEn: `Second ${lemma}.`, textVi: 'Hai.' },
    })
    const examples = [first, second].sort((a, b) => (a.id < b.id ? -1 : 1))
    return { ...word, examples }
  }

  beforeEach(async () => {
    await resetDb(db)
    synthCalls = []
    uploaded = new Map()
  })
  afterAll(() => db.$disconnect())

  it('creates audio for the word and both examples', async () => {
    const w = await seedWord('invoice', 1)
    expect(await generateAudio(db, synth, upload)).toEqual({ words: 1, examples: 2, failed: 0 })
    expect([...uploaded.keys()].sort()).toEqual(
      [`audio/words/${w.id}.mp3`, ...w.examples.map((e) => `audio/examples/${e.id}.mp3`)].sort(),
    )
    expect(synthCalls[0]).toEqual(['invoice', 'en-US-JennyNeural'])
    expect(new TextDecoder().decode(uploaded.get(`audio/words/${w.id}.mp3`))).toBe('invoice')
    const saved = await db.word.findUniqueOrThrow({
      where: { id: w.id },
      include: { examples: true },
    })
    expect(saved.audioKey).toBe(`audio/words/${w.id}.mp3`)
    expect(saved.examples.map((e) => e.audioKey).sort()).toEqual(
      w.examples.map((e) => `audio/examples/${e.id}.mp3`).sort(),
    )
  })

  it('rotates example voices across words', async () => {
    const w1 = await seedWord('invoice', 1)
    const w2 = await seedWord('budget', 2)
    await generateAudio(db, synth, upload)
    const voices = async (ids: string[]) =>
      Promise.all(
        ids.map(async (id) => (await db.example.findUniqueOrThrow({ where: { id } })).voice),
      )
    expect(await voices(w1.examples.map((e) => e.id))).toEqual([
      'en-GB-SoniaNeural',
      'en-AU-NatashaNeural',
    ])
    expect(await voices(w2.examples.map((e) => e.id))).toEqual([
      'en-AU-NatashaNeural',
      'en-US-GuyNeural',
    ])
    expect(synthCalls).toContainEqual([w1.examples[0]!.textEn, 'en-GB-SoniaNeural'])
  })

  it('second run does nothing', async () => {
    await seedWord('invoice', 1)
    await generateAudio(db, synth, upload)
    const callsAfterFirst = synthCalls.length
    expect(await generateAudio(db, synth, upload)).toEqual({ words: 0, examples: 0, failed: 0 })
    expect(synthCalls.length).toBe(callsAfterFirst)
  })

  it('skips words without a meaning', async () => {
    await db.word.create({ data: { lemma: 'raw', tslRank: 1 } })
    expect(await generateAudio(db, synth, upload)).toEqual({ words: 0, examples: 0, failed: 0 })
    expect(synthCalls).toEqual([])
  })

  it('limit counts words', async () => {
    const w1 = await seedWord('invoice', 1)
    const w2 = await seedWord('budget', 2)
    expect(await generateAudio(db, synth, upload, { limit: 1 })).toEqual({
      words: 1,
      examples: 2,
      failed: 0,
    })
    expect((await db.word.findUniqueOrThrow({ where: { id: w1.id } })).audioKey).not.toBeNull()
    expect((await db.word.findUniqueOrThrow({ where: { id: w2.id } })).audioKey).toBeNull()
  })

  it('a failing item leaves its audioKey null and the rest still run', async () => {
    const w = await seedWord('invoice', 1)
    const badKey = `audio/examples/${w.examples[0]!.id}.mp3`
    const flaky: Uploader = async (key, body) => {
      if (key === badKey) throw new Error('upload failed')
      await upload(key, body)
    }
    expect(await generateAudio(db, synth, flaky, { log: () => {} })).toEqual({
      words: 1,
      examples: 1,
      failed: 1,
    })
    const bad = await db.example.findUniqueOrThrow({ where: { id: w.examples[0]!.id } })
    expect([bad.audioKey, bad.voice]).toEqual([null, null])
    expect(await generateAudio(db, synth, upload)).toEqual({ words: 0, examples: 1, failed: 0 })
  })
})
