// src/components/TooltipLayer.tsx
// The app's one tooltip (Micro-interactions spec, Tooltips), in place of the
// system's. Any element with data-tip="…" gets it: after 200ms; at once for
// 400ms after one hid; gliding from one element to the next while it is
// shown. data-tip-keys names a shortcut whose keys show as chips; the closest
// data-tip-side says top, right or bottom (the default); data-tip-overflow
// shows it only while the element's text is cut off. None shows inside
// data-tip-off or while tracks are dragged. Mounted once in App, so the mini
// player's window has it too. The DOM is written directly: a pointer move
// never re-renders React.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTrackDragStore } from '../lib/drag/trackDrag'
import { prefersReducedMotion } from '../lib/glide/glide'
import { shortcutKeys } from '../lib/shortcuts/shortcuts'
import {
  placeTip,
  TIP_DELAY_MS,
  TIP_LEAVE_MS,
  tipEntry,
  type TipSide,
} from '../lib/tooltip/tooltip'
import './TooltipLayer.css'

/** The text cross-fades this long out before the next one comes in. */
const SWAP_MS = 110

/** Whether an element's text, or a descendant's, is cut off. */
function cutOff(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + 1) return true
  for (const child of el.querySelectorAll<HTMLElement>('*')) {
    if (child.scrollWidth > child.clientWidth + 1) return true
  }
  return false
}

/**
 * The element whose tip a node is in, unless tips are off there. A
 * data-tip-overflow element whose text is not cut off passes to the next
 * element with a tip around it.
 */
function tipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  let el = node.closest<HTMLElement>('[data-tip]')
  while (el && el.hasAttribute('data-tip-overflow') && !cutOff(el)) {
    el = el.parentElement?.closest<HTMLElement>('[data-tip]') ?? null
  }
  if (!el || !el.dataset.tip || el.closest('[data-tip-off]')) return null
  return el
}

function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return false
  }
}

/** The tip's text and its keys' chips. */
function fill(into: HTMLElement, el: HTMLElement) {
  into.replaceChildren(document.createTextNode(el.dataset.tip ?? ''))
  const keys = el.dataset.tipKeys ? shortcutKeys(el.dataset.tipKeys) : null
  for (const key of keys ?? []) {
    const chip = document.createElement('kbd')
    chip.textContent = key
    into.append(chip)
  }
}

export function TooltipLayer() {
  const tipRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const tip = tipRef.current
    const text = textRef.current
    const measure = measureRef.current
    if (!tip || !text || !measure) return

    let target: HTMLElement | null = null
    let visible = false
    let hiddenAt = -Infinity
    // Pressed (or Esc): no tip for this element until the pointer leaves it.
    let dismissed: HTMLElement | null = null
    let showTimer: ReturnType<typeof setTimeout> | undefined
    let leaveTimer: ReturnType<typeof setTimeout> | undefined
    let swapTimer: ReturnType<typeof setTimeout> | undefined

    const hide = () => {
      clearTimeout(showTimer)
      clearTimeout(leaveTimer)
      target = null
      if (!visible) return
      visible = false
      hiddenAt = performance.now()
      tip.classList.remove('tip--shown', 'tip--gliding')
      gone.disconnect()
    }
    const dismiss = () => {
      dismissed = target
      hide()
    }
    // While shown: hide if its element leaves the page.
    const gone = new MutationObserver(() => {
      if (target && !target.isConnected) hide()
    })

    const place = (el: HTMLElement) => {
      fill(measure, el)
      // Rounded up, with a pixel to spare: a width rounded down by a fraction
      // would wrap the tip onto a second line.
      const measured = measure.getBoundingClientRect()
      const size = {
        width: Math.ceil(measured.width) + 1,
        height: Math.ceil(measured.height),
      }
      const side = (el.closest<HTMLElement>('[data-tip-side]')?.dataset
        .tipSide ?? 'bottom') as TipSide
      const at = placeTip(el.getBoundingClientRect(), size, side, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
      tip.style.left = `${at.left}px`
      tip.style.top = `${at.top}px`
      tip.style.width = `${size.width}px`
      tip.dataset.side = at.side
    }

    const appear = (el: HTMLElement) => {
      // It left the page while the tip waited: nothing to point at.
      if (!el.isConnected) {
        target = null
        return
      }
      clearTimeout(swapTimer)
      tip.classList.remove('tip--shown', 'tip--gliding')
      fill(text, el)
      text.style.opacity = ''
      place(el)
      void tip.offsetWidth // from its start, not from where the last one went
      tip.classList.add('tip--shown')
      visible = true
      gone.observe(document.body, { childList: true, subtree: true })
    }

    const glide = (el: HTMLElement) => {
      if (!el.isConnected) return hide()
      if (prefersReducedMotion()) return appear(el)
      tip.classList.add('tip--gliding')
      place(el)
      text.style.opacity = '0'
      clearTimeout(swapTimer)
      swapTimer = setTimeout(() => {
        fill(text, el)
        text.style.opacity = ''
      }, SWAP_MS)
    }

    const enter = (el: HTMLElement) => {
      if (el === target) {
        clearTimeout(leaveTimer)
        return
      }
      // No tip here: the one shown belongs to another element, so it goes.
      if (el === dismissed || useTrackDragStore.getState().payload !== null) {
        hide()
        return
      }
      clearTimeout(leaveTimer)
      clearTimeout(showTimer)
      target = el
      const entry = tipEntry(visible, performance.now() - hiddenAt)
      if (entry === 'glide') glide(el)
      else if (entry === 'now') appear(el)
      else showTimer = setTimeout(() => appear(el), TIP_DELAY_MS)
    }

    // Leaving, it waits a moment for the next element, so it can glide there.
    const leave = () => {
      clearTimeout(showTimer)
      if (!visible) {
        target = null
        return
      }
      clearTimeout(leaveTimer)
      leaveTimer = setTimeout(hide, TIP_LEAVE_MS)
    }

    const onOver = (e: PointerEvent) => {
      const el = tipTarget(e.target)
      if (el) enter(el)
    }
    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget instanceof Node ? e.relatedTarget : null
      if (dismissed && !(to && dismissed.contains(to))) dismissed = null
      if (!target) return
      if (to && target.contains(to)) return
      leave()
    }
    const onFocusIn = (e: FocusEvent) => {
      const el = tipTarget(e.target)
      if (el && focusVisible(el)) enter(el)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (dismissed && e.target instanceof Node && dismissed.contains(e.target))
        dismissed = null
      if (target && e.target instanceof Node && target.contains(e.target))
        leave()
    }
    // Esc hides it; so does pressing the element from the keyboard, which
    // may change what the tip would say (Play turns into Pause).
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' ||
        (visible && (e.key === 'Enter' || e.key === ' '))
      )
        dismiss()
    }
    const unsubscribe = useTrackDragStore.subscribe((state) => {
      if (state.payload !== null) hide()
    })

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('scroll', hide, { capture: true, passive: true })
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('scroll', hide, { capture: true })
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', hide)
      unsubscribe()
      gone.disconnect()
      clearTimeout(showTimer)
      clearTimeout(leaveTimer)
      clearTimeout(swapTimer)
    }
  }, [])

  return createPortal(
    <>
      <div ref={tipRef} className="tip" role="tooltip">
        <span ref={textRef} className="tip__text" />
      </div>
      <span
        ref={measureRef}
        className="tip tip__text tip--measure"
        aria-hidden="true"
      />
    </>,
    document.body,
  )
}
