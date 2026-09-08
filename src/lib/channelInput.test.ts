/**
 * The guard in front of a 100-unit call.
 *
 * Getting this wrong in either direction costs something real: too strict and
 * a genuine channel is refused, too loose and a DJ's name quietly spends a
 * hundred units to fetch the wrong thing.
 */

import { describe, expect, it } from 'vitest'
import { looksLikeAChannel } from './channelInput'

describe('telling a channel from a name', () => {
  it('accepts every shape the backend can resolve cheaply', () => {
    expect(looksLikeAChannel('@cercle')).toBe(true)
    expect(looksLikeAChannel('cercle@')).toBe(true)
    expect(looksLikeAChannel('https://www.youtube.com/@cercle')).toBe(true)
    expect(looksLikeAChannel('youtube.com/channel/UCPKT_csvP72boVX0XrMtagQ')).toBe(true)
    expect(looksLikeAChannel('UCPKT_csvP72boVX0XrMtagQ')).toBe(true)
    expect(looksLikeAChannel('https://youtu.be/_wfwSaA5GeE')).toBe(true)
    expect(looksLikeAChannel('  www.youtube.com/watch?v=abc  ')).toBe(true)
  })

  it('refuses a bare name, which is the case that costs a hundred units', () => {
    expect(looksLikeAChannel('Solomun')).toBe(false)
    expect(looksLikeAChannel('Hot Since 82')).toBe(false)
    expect(looksLikeAChannel('joseph capriati')).toBe(false)
    expect(looksLikeAChannel('')).toBe(false)
    expect(looksLikeAChannel('   ')).toBe(false)
  })

  it('does not mistake a name containing "uc" for a channel id', () => {
    // The id is UC plus 22 more; a short word is not one.
    expect(looksLikeAChannel('Luciano')).toBe(false)
    expect(looksLikeAChannel('UC123')).toBe(false)
  })
})
