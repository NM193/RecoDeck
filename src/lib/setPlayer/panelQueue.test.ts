import { describe, expect, it } from 'vitest'
import { queuePanel } from './panelQueue'

describe('queuePanel', () => {
  it('runs the calls in order, a slow open before the close sent after it', async () => {
    const done: string[] = []
    const open = queuePanel(() => new Promise<void>((resolve) => setTimeout(() => { done.push('open'); resolve() }, 30)))
    const close = queuePanel(async () => { done.push('close') })
    await Promise.all([open, close])
    expect(done).toEqual(['open', 'close'])
  })

  it('goes on after a call that failed', async () => {
    const failed = queuePanel(() => Promise.reject(new Error('no panel')))
    const next = queuePanel(async () => 'moved')
    await expect(failed).rejects.toThrow('no panel')
    await expect(next).resolves.toBe('moved')
  })
})
