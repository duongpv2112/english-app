import type { FastifyInstance } from 'fastify'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testApp } from '../../test/app.ts'

describe('SPA serving', () => {
  let dist: string
  let app: FastifyInstance
  let appWithoutDist: FastifyInstance

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'web-dist-'))
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'index.html'), '<div id=app>')
    writeFileSync(join(dist, 'assets', 'a.js'), 'console.log(1)')
    app = await testApp({ webDistDir: dist })
    appWithoutDist = await testApp()
  })

  afterAll(async () => {
    await app.close()
    await appWithoutDist.close()
    rmSync(dist, { recursive: true, force: true })
  })

  it('serves static asset', async () => {
    const res = await app.inject('/assets/a.js')
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('console.log(1)')
  })

  it('serves index.html at /', async () => {
    expect((await app.inject('/')).body).toContain('<div id=app>')
  })

  it('SPA fallback for client routes', async () => {
    const res = await app.inject('/study/today')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<div id=app>')
  })

  it('unknown /api route stays JSON 404', async () => {
    const res = await app.inject('/api/nope')
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })

  it('missing asset file is a 404, not index.html', async () => {
    const res = await app.inject('/assets/missing.js')
    expect(res.statusCode).toBe(404)
  })

  it('no static serving when webDistDir is null', async () => {
    expect((await appWithoutDist.inject('/study/today')).statusCode).toBe(404)
  })
})
