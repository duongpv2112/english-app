import { describe, expect, it } from 'vitest'
import { keyAction } from './keys.ts'

const key = (k: string, mods: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key: k, ...mods })

describe('keyAction', () => {
  it('Space flips an unflipped card', () => {
    expect(keyAction(key(' '), false)).toEqual({ type: 'flip' })
    expect(keyAction(key(' '), true)).toBeNull()
  })

  it('1-4 rate a flipped card', () => {
    expect(keyAction(key('1'), true)).toEqual({ type: 'rate', rating: 1 })
    expect(keyAction(key('4'), true)).toEqual({ type: 'rate', rating: 4 })
    expect(keyAction(key('3'), false)).toBeNull()
    expect(keyAction(key('5'), true)).toBeNull()
  })

  it('ignores keys with Ctrl, Cmd or Alt (browser shortcuts like Ctrl+1)', () => {
    expect(keyAction(key('1', { ctrlKey: true }), true)).toBeNull()
    expect(keyAction(key('1', { metaKey: true }), true)).toBeNull()
    expect(keyAction(key(' ', { altKey: true }), false)).toBeNull()
  })

  it('ignores auto-repeat', () => {
    expect(keyAction(key('1', { repeat: true }), true)).toBeNull()
  })
})
