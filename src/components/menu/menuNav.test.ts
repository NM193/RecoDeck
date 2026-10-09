// src/components/menu/menuNav.test.ts
import { describe, expect, it } from 'vitest'
import { stepIndex } from './menuNav'

const entries = [
  { kind: 'action' },
  { kind: 'separator' },
  { kind: 'action', disabled: true },
  { kind: 'submenu' },
  { kind: 'action' },
]

describe('moving through a menu', () => {
  it('passes over separators and disabled items', () => {
    expect(stepIndex(entries, 0, 1)).toBe(3)
    expect(stepIndex(entries, 3, -1)).toBe(0)
  })

  it('starts at the first or the last item', () => {
    expect(stepIndex(entries, -1, 1)).toBe(0)
    expect(stepIndex(entries, -1, -1)).toBe(4)
  })

  it('wraps round at the ends', () => {
    expect(stepIndex(entries, 4, 1)).toBe(0)
    expect(stepIndex(entries, 0, -1)).toBe(4)
  })

  it('answers -1 when nothing can be chosen', () => {
    expect(stepIndex([{ kind: 'separator' }, { kind: 'action', disabled: true }], -1, 1)).toBe(-1)
  })
})
