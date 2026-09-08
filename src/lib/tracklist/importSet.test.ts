/**
 * The budget rule for unattended import.
 *
 * This is the only place in the feature where the app spends someone's quota
 * with nobody watching, so the arithmetic is tested rather than reasoned about.
 */

import { describe, expect, it } from 'vitest'
import {
  AUTO_IMPORT_MAX,
  AUTO_IMPORT_RESERVE,
  SET_COST_UNITS,
  setsToAutoImport,
} from './importSet'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `video${i}`)

describe('what may be imported without being asked', () => {
  it('never spends into the reserve', () => {
    // A full day buys plenty, so the cap is what bites.
    expect(setsToAutoImport(ids(10), 10_000)).toHaveLength(AUTO_IMPORT_MAX)

    // At the reserve exactly, and below it, nothing goes.
    expect(setsToAutoImport(ids(10), AUTO_IMPORT_RESERVE)).toEqual([])
    expect(setsToAutoImport(ids(10), 0)).toEqual([])
    expect(setsToAutoImport(ids(10), 500)).toEqual([])
  })

  it('takes only what the remainder actually pays for', () => {
    // 21 units over the reserve buys three sets at seven, not four.
    const left = AUTO_IMPORT_RESERVE + 3 * SET_COST_UNITS
    expect(setsToAutoImport(ids(10), left)).toHaveLength(3)
    expect(setsToAutoImport(ids(10), left + SET_COST_UNITS - 1)).toHaveLength(3)
  })

  it('imports in the order it was given, and never more than exists', () => {
    expect(setsToAutoImport(['a', 'b'], 10_000)).toEqual(['a', 'b'])
    expect(setsToAutoImport([], 10_000)).toEqual([])
  })
})
