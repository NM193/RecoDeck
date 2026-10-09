// src/lib/useTabThumb.ts
// A tab bar's sliding highlight (Interactions spec, Controls: tabs follow the
// buttons): where the selected tab sits in its bar, read after layout and
// again whenever the bar or a tab changes size (a count arriving), so the
// thumb glides there. It appears in place on the first read, without sliding
// in from the left.
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

interface ThumbBox {
  left: number
  width: number
}

export function useTabThumb(bar: RefObject<HTMLElement | null>, selected: string): CSSProperties {
  const [box, setBox] = useState<ThumbBox | null>(null)
  const [moving, setMoving] = useState(false)

  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const measure = () => {
      const tab = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      setBox((current) => {
        if (!tab) return null
        const next = { left: tab.offsetLeft, width: tab.offsetWidth }
        return current && current.left === next.left && current.width === next.width ? current : next
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.querySelectorAll('[role="tab"]').forEach((tab) => observer.observe(tab))
    return () => observer.disconnect()
  }, [bar, selected])

  // Only after the first placement does the thumb slide.
  useLayoutEffect(() => {
    if (box === null || moving) return
    const frame = requestAnimationFrame(() => setMoving(true))
    return () => cancelAnimationFrame(frame)
  }, [box, moving])

  if (box === null) return { opacity: 0 }
  return {
    width: box.width,
    transform: `translateX(${box.left}px)`,
    transition: moving ? undefined : 'none',
  }
}
