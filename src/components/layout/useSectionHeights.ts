// src/components/layout/useSectionHeights.ts
// Measures the sidebar's section area and each open list, and shares the
// height between the lists (lib/sidebarSections.ts). Called once, from
// Sidebar.tsx, which gives each open list the height this answers.
import { useCallback, useEffect, useRef, useState } from 'react'
import { distributeHeights } from '../../lib/sidebarSections'
import type { SidebarSection } from '../../lib/sidebarPrefs'

type Heights = Partial<Record<SidebarSection, number>>

export interface SectionHeights {
  /** Attach to the section area under the nav. */
  areaRef: (el: HTMLDivElement | null) => (() => void) | undefined
  /**
   * Attach to an open section's list wrapper, which keeps its own height (the
   * body around it is the one that is sized and scrolls). The wrapper carries
   * `data-section` with its section's id.
   */
  contentRef: (el: HTMLDivElement | null) => (() => void) | undefined
  /** Each open section's list height; absent until measured. */
  heights: Heights
  /**
   * True when these heights came from opening or closing a section, which the
   * lists animate; false when they came from a resize, which they follow at
   * once (an animation would trail the window and push headers off screen).
   */
  animate: boolean
}

/** An element's height with its vertical margins (the dividers have margins). */
function outerHeight(el: HTMLElement): number {
  const style = getComputedStyle(el)
  return (
    el.getBoundingClientRect().height +
    parseFloat(style.marginTop) +
    parseFloat(style.marginBottom)
  )
}

function sameHeights(a: Heights, b: Heights): boolean {
  const keys = Object.keys(a) as SidebarSection[]
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  )
}

/** @param open the open sections, top to bottom. */
export function useSectionHeights(open: SidebarSection[]): SectionHeights {
  const area = useRef<HTMLDivElement | null>(null)
  const contents = useRef(new Map<string, HTMLDivElement>())
  const observer = useRef<ResizeObserver | null>(null)
  const [state, setState] = useState<{ heights: Heights; animate: boolean }>({
    heights: {},
    animate: false,
  })
  // One string, so measuring follows which sections are open, not each render.
  const openKey = open.join(',')
  /** The open sections at the last measurement: a change since then animates. */
  const measuredKey = useRef<string | null>(null)

  const measure = useCallback(() => {
    const el = area.current
    if (!el) return
    let fixed = 0
    el.querySelectorAll<HTMLElement>(
      ':scope > .sidebar-divider, :scope > .sidebar-section > .sidebar-section__header',
    ).forEach((part) => {
      fixed += outerHeight(part)
    })
    const sections = openKey ? (openKey.split(',') as SidebarSection[]) : []
    // Whole pixels, rounded so a list that fits never shows a scrollbar.
    const natural = sections.map((section) => {
      const content = contents.current.get(section)
      return content ? Math.ceil(content.getBoundingClientRect().height) : 0
    })
    const available = Math.floor(el.getBoundingClientRect().height) - fixed
    const shares = distributeHeights(available, natural)
    const next: Heights = {}
    sections.forEach((section, i) => {
      next[section] = shares[i]
    })
    const animate = measuredKey.current !== openKey
    measuredKey.current = openKey
    setState((prev) =>
      sameHeights(prev.heights, next) ? prev : { heights: next, animate },
    )
  }, [openKey])

  // The observer outlives renders, so it calls whichever measure is current.
  const measureRef = useRef(measure)
  useEffect(() => {
    measureRef.current = measure
    // A section closing changes no size the observer sees: measure anyway.
    const frame = requestAnimationFrame(() => measureRef.current())
    return () => cancelAnimationFrame(frame)
  }, [measure])

  useEffect(() => () => observer.current?.disconnect(), [])

  const watch = useCallback((el: HTMLElement) => {
    observer.current ??= new ResizeObserver(() => measureRef.current())
    observer.current.observe(el)
    return () => observer.current?.unobserve(el)
  }, [])

  const areaRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return undefined
      area.current = el
      const stop = watch(el)
      return () => {
        stop()
        area.current = null
      }
    },
    [watch],
  )

  const contentRef = useCallback(
    (el: HTMLDivElement | null) => {
      const section = el?.dataset.section
      if (!el || !section) return undefined
      contents.current.set(section, el)
      const stop = watch(el)
      return () => {
        stop()
        contents.current.delete(section)
      }
    },
    [watch],
  )

  return { areaRef, contentRef, heights: state.heights, animate: state.animate }
}
