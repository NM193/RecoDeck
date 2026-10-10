import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boxIn, createGlide, GLIDE, menuGlide } from './glide'

// jsdom has no layout: each element gets the rect a test gives it.
function rect(
  el: Element,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect
}

function setReducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

let track: HTMLDivElement
let el: HTMLSpanElement
let a: HTMLDivElement
let b: HTMLDivElement
beforeEach(() => {
  setReducedMotion(false)
  track = document.createElement('div')
  el = document.createElement('span')
  a = document.createElement('div')
  b = document.createElement('div')
  track.append(el, a, b)
  document.body.append(track)
  rect(track, 100, 50, 300, 200)
  rect(a, 100, 50, 300, 40)
  rect(b, 100, 90, 300, 40)
})
afterEach(() => track.remove())

describe('boxIn: where an item sits in its track', () => {
  it('is the difference of their rects', () => {
    expect(boxIn(track, b)).toEqual({ x: 0, y: 40, width: 300, height: 40 })
  })

  it("takes off the track's border and adds its scroll", () => {
    Object.defineProperty(track, 'clientTop', { value: 1 })
    Object.defineProperty(track, 'clientLeft', { value: 1 })
    track.scrollTop = 30
    expect(boxIn(track, b)).toEqual({ x: -1, y: 69, width: 300, height: 40 })
  })

  it('undoes a scale on the track (a menu scaling in)', () => {
    Object.defineProperty(track, 'offsetWidth', { value: 600 })
    Object.defineProperty(track, 'offsetHeight', { value: 400 })
    // drawn at half size: 300×200 on screen for 600×400 of layout
    expect(boxIn(track, b)).toEqual({ x: 0, y: 80, width: 600, height: 80 })
  })
})

describe('createGlide', () => {
  it('appears on its first item: jumps there small and unseen, then grows in', () => {
    const glide = createGlide(track, el, GLIDE.row)
    const seen: string[] = []
    // the jump is read (offsetWidth) before the transition starts
    Object.defineProperty(el, 'offsetWidth', {
      get: () => {
        seen.push(
          `${el.style.transition}|${el.style.transform}|${el.style.opacity}`,
        )
        return 0
      },
    })
    glide.moveTo(b)
    expect(seen).toEqual(['none|translate3d(0px, 40px, 0) scaleY(.4)|0'])
    expect(el.style.transform).toBe('translate3d(0px, 40px, 0)')
    expect(el.style.width).toBe('300px')
    expect(el.style.height).toBe('40px')
    expect(el.style.opacity).toBe('1')
    expect(el.style.transition).toContain('transform 240ms')
    expect(glide.item).toBe(b)
  })

  it('slides to the next item', () => {
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    glide.moveTo(b)
    expect(el.style.transform).toBe('translate3d(0px, 40px, 0)')
    expect(el.style.transition).toContain('transform 240ms var(--ease-soft)')
    expect(el.style.transition).toContain('height 240ms')
    expect(el.style.opacity).toBe('1')
  })

  it('fades out where it is, and appears again from small', () => {
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    glide.moveTo(null)
    expect(el.style.opacity).toBe('0')
    expect(el.style.transition).toBe('opacity 140ms var(--ease)')
    expect(el.style.transform).toBe('translate3d(0px, 0px, 0)')
    expect(glide.item).toBeNull()
    glide.moveTo(b)
    expect(el.style.transform).toBe('translate3d(0px, 40px, 0)')
    expect(el.style.opacity).toBe('1')
  })

  it('on its own item, follows it only when it moved, without a transition', () => {
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    const transition = el.style.transition
    glide.moveTo(a)
    expect(el.style.transition).toBe(transition)
    rect(a, 100, 70, 300, 40) // a row inserted above pushed it down
    glide.moveTo(a)
    expect(el.style.transition).toBe('none')
    expect(el.style.transform).toBe('translate3d(0px, 20px, 0)')
  })

  it('leaves an unmounted item alone on refresh', () => {
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    a.remove()
    rect(a, 0, 0, 0, 0)
    glide.refresh()
    expect(el.style.transform).toBe('translate3d(0px, 0px, 0)')
    expect(el.style.width).toBe('300px')
  })

  it("takes each item's corners, and its colour when it has one", () => {
    a.style.borderRadius = '6px'
    const glide = createGlide(track, el, {
      ...GLIDE.menu,
      tintFor: (item) => (item === b ? 'red' : null),
    })
    glide.moveTo(a)
    expect(el.style.borderRadius).toBe('6px')
    expect(el.style.backgroundColor).toBe('')
    glide.moveTo(b)
    expect(el.style.backgroundColor).toBe('red')
    expect(el.style.transition).toContain('background-color 240ms')
  })

  it('with reduced motion, only fades: no growing and no sliding', () => {
    setReducedMotion(true)
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    expect(el.style.transition).toBe('opacity 160ms var(--ease)')
    expect(el.style.transform).toBe('translate3d(0px, 0px, 0)')
    glide.moveTo(b)
    expect(el.style.transition).toBe('none')
    expect(el.style.transform).toBe('translate3d(0px, 40px, 0)')
  })

  it('works without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    const glide = createGlide(track, el, GLIDE.row)
    glide.moveTo(a)
    expect(el.style.opacity).toBe('1')
    vi.unstubAllGlobals()
  })
})

describe('menuGlide', () => {
  it('grows like a menu and turns red on the destructive item', () => {
    const options = menuGlide('item--danger')
    expect(options.enterFrom).toBe(GLIDE.menu.enterFrom)
    b.classList.add('item--danger')
    expect(options.tintFor?.(a)).toBeNull()
    expect(options.tintFor?.(b)).toBe('rgba(var(--color-danger-rgb), 0.2)')
  })
})
