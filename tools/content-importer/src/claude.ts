import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { PARTS_OF_SPEECH, type Enricher, type WordEnrichment } from './enrich.ts'

export const DEFAULT_MODEL = 'claude-haiku-5-5'

// The shape Claude is asked to produce. Length rules (non-empty strings, exactly two examples) are
// left out because structured outputs do not support them; enrichWords checks them afterwards.
const outputSchema = z.object({
  words: z.array(
    z.object({
      lemma: z.string(),
      pos: z.enum(PARTS_OF_SPEECH),
      ipa: z.string(),
      meaningVi: z.string(),
      examples: z.array(z.object({ textEn: z.string(), textVi: z.string() })),
    }),
  ),
})

const SYSTEM_PROMPT = `You write vocabulary flashcards for a Vietnamese IT professional at CEFR A2 who is preparing for the TOEIC Listening & Reading test. The cards are studied daily with spaced repetition, and the example sentences are also used for listening dictation, so they are read aloud by a text-to-speech voice.

For every word in the user's list, return one entry:
- lemma: the word exactly as given.
- pos: its most common part of speech in business English.
- ipa: General American pronunciation in IPA, wrapped in slashes, for example /ˈɪnvɔɪs/.
- meaningVi: a short Vietnamese meaning (a few words) for the sense most common in TOEIC and workplace English. If two senses are both common, give both separated by "; ".
- examples: exactly two sentences set in an office or IT workplace, at A2–B1 level, each 6 to 14 words long. Each sentence uses the word (an inflected form is fine) in the sense you gave, sounds natural when spoken, and avoids abbreviations, digits and symbols that a voice would read awkwardly. textEn is the sentence; textVi is a natural Vietnamese translation of it.

Return every word from the list exactly once, and no other words.`

/** An Enricher backed by the Claude API, using structured output so the reply is always JSON. */
export function createClaudeEnricher(client: Anthropic, model: string = DEFAULT_MODEL): Enricher {
  return async (lemmas: string[]): Promise<WordEnrichment[]> => {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Words:\n${lemmas.join('\n')}` }],
      output_config: { format: zodOutputFormat(outputSchema) },
    })
    if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
      throw new Error(`Claude did not return usable content (stop_reason: ${response.stop_reason})`)
    }
    // Checked properly by enrichWords; the cast only reflects the looser request schema.
    return response.parsed_output.words as WordEnrichment[]
  }
}
