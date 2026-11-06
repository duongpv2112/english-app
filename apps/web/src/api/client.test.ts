import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client.ts'

function mockFetch(status: number, body: unknown) {
  const f = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', f)
  return f
}

function mockFetchText(status: number, text: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(text, { status })))
}

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns parsed JSON on 200', async () => {
    mockFetch(200, { id: '1', email: 'a@b.c' })
    await expect(api('/auth/me')).resolves.toEqual({ id: '1', email: 'a@b.c' })
  })

  it('returns undefined on 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('throws ApiError with code on 401', async () => {
    mockFetch(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })
    await expect(api('/auth/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('throws INTERNAL_ERROR when error body is not JSON', async () => {
    mockFetchText(502, '<html>Bad Gateway</html>')
    await expect(api('/auth/me')).rejects.toMatchObject({ code: 'INTERNAL_ERROR', status: 502 })
  })

  it('sends credentials and JSON body', async () => {
    const f = mockFetch(200, {})
    await api('/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } })
    expect(f).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({ email: 'a', password: 'b' }),
      }),
    )
  })
})
