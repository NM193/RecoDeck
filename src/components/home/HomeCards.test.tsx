import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HomeCard, type HomeActions, type HomeFacts } from './HomeCards'
import type { HomeData } from './useHomeData'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  host = document.createElement('div')
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  vi.restoreAllMocks()
})

const facts: HomeFacts = {
  playlists: [],
  totalTrackCount: 0,
  folderCount: 0,
  spotify: null,
  youtubeMusic: null,
}

describe('a Home card whose body throws', () => {
  it('keeps its head and says it could not load, instead of taking Home down', () => {
    // Recently played's data is unreadable; everything else is "not read yet".
    const data = new Proxy({} as HomeData, {
      get: (_target, prop) => {
        if (prop === 'recentlyPlayed')
          throw new TypeError('recentlyPlayed is broken')
        return null
      },
    })
    act(() =>
      root.render(
        <HomeCard
          id="recently-played"
          columns={2}
          editing={false}
          onRemove={() => {}}
          data={data}
          facts={facts}
          actions={{} as HomeActions}
        />,
      ),
    )
    expect(host.querySelector('.home-card__title')?.textContent).toBe(
      'Recently played',
    )
    expect(host.querySelector('.home-card__body')?.textContent).toContain(
      "This card couldn't load",
    )
  })
})
