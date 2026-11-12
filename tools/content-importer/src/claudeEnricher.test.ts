import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { buildEnrichRequest, createClaudeEnricher, parseEnrichResponse } from './claudeEnricher.ts'

const textMessage = (text: string, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [{ type: 'text', text }],
})

describe('buildEnrichRequest', () => {
  it('builds a structured-output request with fallback enabled', () => {
    const req = buildEnrichRequest(['invoice', 'budget'], 'claude-opus-5-5')
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.max_tokens).toBe(16000)
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(req.fallbacks).toBe('default')
    const format = req.output_config?.format
    expect(format?.type).toBe('json_schema')
    expect(format?.schema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(JSON.stringify(req.messages)).toContain('invoice\\nbudget')
  })

  it('sends a plain schema without a $schema key', () => {
    expect(buildEnrichRequest(['x'], 'm').output_config?.format?.schema).not.toHaveProperty('$schema')
  })

  it('makes every nested object in the schema closed', () => {
    const schema = JSON.stringify(buildEnrichRequest(['x'], 'm').output_config?.format?.schema)
    const objects = schema.match(/"type":"object"/g)?.length ?? 0
    const closed = schema.match(/"additionalProperties":false/g)?.length ?? 0
    expect(objects).toBe(3)
    expect(closed).toBe(objects)
  })
})

describe('parseEnrichResponse', () => {
  it('parses the JSON text block', () => {
    expect(parseEnrichResponse(textMessage('{"words":[]}'))).toEqual({ words: [] })
  })

  it.each(['refusal', 'max_tokens'])('throws on stop_reason %s', (stop_reason) => {
    expect(() => parseEnrichResponse(textMessage('{}', stop_reason))).toThrow(stop_reason)
  })

  it('throws when there is no text block', () => {
    expect(() => parseEnrichResponse({ stop_reason: 'end_turn', content: [] })).toThrow(/no text/i)
  })

  it('throws on non-JSON text', () => {
    expect(() => parseEnrichResponse(textMessage('oops'))).toThrow()
  })
})

describe('createClaudeEnricher', () => {
  it('sends the request and returns parsed JSON', async () => {
    const create = vi.fn().mockResolvedValue(textMessage('{"words":[]}'))
    const client = { beta: { messages: { create } } } as unknown as Anthropic
    const enricher = createClaudeEnricher(client, 'claude-opus-5-5')
    await expect(enricher(['invoice'])).resolves.toEqual({ words: [] })
    expect(create).toHaveBeenCalledWith(buildEnrichRequest(['invoice'], 'claude-opus-5-5'))
  })
})
