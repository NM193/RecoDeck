import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HoverGlide } from './HoverGlide'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('HoverGlide', () => {
  it('is its list, with the highlight before the items', () => {
    act(() =>
      root.render(
        <HoverGlide
          className="rows"
          item=".row"
          kind="row"
          id="list"
          hidden={false}
        >
          <div className="row">one</div>
        </HoverGlide>,
      ),
    )
    const list = host.querySelector('#list')!
    expect(list.className).toBe('glide-track rows')
    expect(list.firstElementChild?.className).toBe('glide')
    expect(list.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(list.querySelectorAll('.glide')).toHaveLength(1)
  })

  it('adds the open highlight, on top of the hover one, when asked', () => {
    act(() =>
      root.render(
        <HoverGlide item=".row" kind="row" open=".row--open">
          <div className="row row--open">one</div>
        </HoverGlide>,
      ),
    )
    const glides = host.querySelectorAll('.glide')
    expect(glides).toHaveLength(2)
    expect(glides[1].className).toBe('glide glide--open')
    expect((glides[1] as HTMLElement).style.opacity).toBe('1')
  })
})
