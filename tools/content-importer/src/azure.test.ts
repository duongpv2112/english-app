import { describe, expect, it } from 'vitest'
import { createAzureSynthesizer } from './azure.ts'

function setup(status = 200, bytes = new Uint8Array([1, 2, 3])) {
  const seen: { url?: string; init?: RequestInit } = {}
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url)
    seen.init = init
    return new Response(status === 200 ? bytes : 'Too many requests', { status })
  }) as typeof fetch
  const synth = createAzureSynthesizer({ key: 'k', region: 'southeastasia', fetch: fakeFetch })
  return { seen, synth }
}

describe('createAzureSynthesizer', () => {
  it('posts escaped SSML with the right headers', async () => {
    const { seen, synth } = setup()
    await synth(`R&D <team> isn't "late"`, 'en-GB-SoniaNeural')
    const headers = seen.init!.headers as Record<string, string>
    expect(seen.url).toBe('https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1')
    expect(seen.init!.method).toBe('POST')
    expect(headers['Ocp-Apim-Subscription-Key']).toBe('k')
    expect(headers['Content-Type']).toBe('application/ssml+xml')
    expect(headers['X-Microsoft-OutputFormat']).toBe('audio-24khz-48kbitrate-mono-mp3')
    expect(seen.init!.body).toBe(
      '<speak version="1.0" xml:lang="en-GB"><voice name="en-GB-SoniaNeural">' +
        'R&amp;D &lt;team&gt; isn&apos;t &quot;late&quot;</voice></speak>',
    )
  })

  it('returns the audio bytes', async () => {
    const { synth } = setup()
    expect([...(await synth('x', 'en-US-JennyNeural'))]).toEqual([1, 2, 3])
  })

  it('throws with the status on a non-2xx response', async () => {
    const { synth } = setup(429)
    await expect(synth('x', 'en-US-JennyNeural')).rejects.toThrow(/429/)
  })
})
