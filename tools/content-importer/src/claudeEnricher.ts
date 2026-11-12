import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { WordEnricher } from './enrich.ts'
import { enrichOutputSchema } from './enrichSchema.ts'

export const ENRICH_SYSTEM_PROMPT = `You write vocabulary flashcard content for a Vietnamese learner at CEFR level A2 who works in IT and is preparing for the TOEIC exam.

For every English word you are given, return one entry with:
- lemma: the word exactly as given.
- pos: its most common part of speech in TOEIC contexts, one of: noun, verb, adjective, adverb, preposition, conjunction, pronoun, determiner, number, other.
- ipa: General American pronunciation in IPA, wrapped in slashes, e.g. /ˈɪnvɔɪs/.
- meaningVi: a short Vietnamese meaning for that part of speech; at most 3 senses, separated by "; ".
- examples: exactly 2 example sentences set in an office or IT workplace, at level A2-B1, under 15 words each, each using the word (any inflected form). For each give textEn and textVi, a natural Vietnamese translation.

Return every word you were given, in the same order.`

// The `$schema` meta key is not part of the schema itself; leave it out of the request.
const outputJsonSchema: Record<string, unknown> = z.toJSONSchema(enrichOutputSchema)
delete outputJsonSchema.$schema

export function buildEnrichRequest(
  lemmas: string[],
  model: string,
): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      format: { type: 'json_schema', schema: outputJsonSchema },
    },
    system: ENRICH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Words:\n${lemmas.join('\n')}` }],
  }
}

interface MessageLike {
  stop_reason: string | null
  content: { type: string; text?: string }[]
}

export function parseEnrichResponse(message: MessageLike): unknown {
  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
    throw new Error(`Claude stopped with stop_reason ${message.stop_reason}`)
  }
  const text = message.content.find((b) => b.type === 'text')?.text
  if (text === undefined) throw new Error('Claude response has no text block')
  return JSON.parse(text)
}

export function createClaudeEnricher(client: Anthropic, model: string): WordEnricher {
  return async (lemmas) => {
    const message = await client.beta.messages.create(buildEnrichRequest(lemmas, model))
    return parseEnrichResponse(message)
  }
}
