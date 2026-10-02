// src/lib/sidebarPrefs.test.ts
import { describe, expect, it } from 'vitest'
import { COLLAPSE_BELOW, collapseOnResize, initialCollapsed } from './sidebarPrefs'

describe('collapsing the sidebar', () => {
  describe('at start-up', () => {
    it('uses the stored choice on a wide window', () => {
      expect(initialCollapsed('true', 1400)).toBe(true)
      expect(initialCollapsed('false', 1400)).toBe(false)
    })

    it('starts expanded when nothing was ever stored', () => {
      expect(initialCollapsed(null, 1400)).toBe(false)
    })

    it('ignores a stored value it does not recognise', () => {
      expect(initialCollapsed('yes', 1400)).toBe(false)
    })

    it('always starts collapsed on a narrow window', () => {
      expect(initialCollapsed('false', COLLAPSE_BELOW - 1)).toBe(true)
      expect(initialCollapsed(null, 800)).toBe(true)
    })
  })

  describe('on a window resize', () => {
    it('collapses when the window crosses below the line', () => {
      expect(collapseOnResize(1200, 1000)).toBe(true)
    })

    it('expands when the window crosses back above it', () => {
      expect(collapseOnResize(1000, 1200)).toBe(false)
    })

    it('treats exactly the line as wide', () => {
      expect(collapseOnResize(COLLAPSE_BELOW - 1, COLLAPSE_BELOW)).toBe(false)
      expect(collapseOnResize(COLLAPSE_BELOW, COLLAPSE_BELOW - 1)).toBe(true)
    })

    it('leaves a manual choice alone while staying on one side', () => {
      expect(collapseOnResize(1400, 1200)).toBeNull()
      expect(collapseOnResize(900, 1000)).toBeNull()
    })
  })
})
