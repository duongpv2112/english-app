import type { Synthesizer } from './tts.ts'

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!)
}

/** A Synthesizer backed by the Azure Speech text-to-speech REST API. */
export function createAzureSynthesizer(cfg: {
  key: string
  region: string
  fetch?: typeof fetch
}): Synthesizer {
  const doFetch = cfg.fetch ?? fetch
  const url = `https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`
  return async (text, voice) => {
    // Voice names start with their locale, e.g. "en-GB-SoniaNeural".
    const locale = voice.slice(0, 5)
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': cfg.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'english-app-importer',
      },
      body:
        `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}">` +
        `${escapeXml(text)}</voice></speak>`,
    })
    if (!res.ok) throw new Error(`Azure TTS responded ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }
}
