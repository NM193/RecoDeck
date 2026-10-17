import { describe, expect, it } from 'vitest'
import { fixSummaryMessage, followedMessage } from './messages'

describe('followedMessage', () => {
  it('says nothing when no file was followed', () => {
    expect(followedMessage(0)).toBeNull()
  })
  it('counts one and many', () => {
    expect(followedMessage(1)).toBe('Followed 1 moved file')
    expect(followedMessage(98)).toBe('Followed 98 moved files')
  })
})

describe('fixSummaryMessage', () => {
  it('lists the non-zero parts, capitalized', () => {
    expect(
      fixSummaryMessage({ relinked: 2, merged: 0, removed: 1, skipped: [] }),
    ).toBe('Relinked 2 · removed 1')
    expect(
      fixSummaryMessage({
        relinked: 0,
        merged: 1,
        removed: 0,
        skipped: [{ track_id: 4, reason: 'file is gone' }],
      }),
    ).toBe('Merged 1 · 1 skipped')
  })
})
