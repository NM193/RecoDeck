import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../Icon'

/**
 * One Settings section, collapsed until it is wanted.
 *
 * Eight sections stacked open is a page nobody reads to the bottom of. Closed,
 * the same page is a contents list: eight lines, each saying what is inside.
 *
 * Which ones are open is remembered per person, in localStorage rather than the
 * settings table — it describes how somebody left a window, not anything about
 * their library, and it is no loss if it comes back empty.
 */
const STORAGE_KEY = 'settingsOpenSections'

function readOpen(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    // A private window, cleared site data, or storage that throws on read.
    return []
  }
}

function writeOpen(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Not remembering is a smaller problem than failing to open a section.
  }
}

export function CollapsibleSection({
  id,
  title,
  summary,
  children,
}: {
  /** Stable key for remembering whether this one was left open. */
  id: string
  title: string
  /** One line saying what is inside, read while the section is closed. */
  summary: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  // Read once on mount rather than in the initial state, so a storage that
  // throws cannot stop the whole Settings page from rendering.
  useEffect(() => {
    setOpen(readOpen().includes(id))
  }, [id])

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      const nowOpen = !wasOpen
      const ids = readOpen().filter((other) => other !== id)
      writeOpen(nowOpen ? [...ids, id] : ids)
      return nowOpen
    })
  }, [id])

  return (
    <section className={`sv-section sv-collapsible ${open ? 'sv-collapsible--open' : ''}`}>
      <button
        type="button"
        className="sv-collapsible__header"
        onClick={toggle}
        aria-expanded={open}
      >
        <Icon
          name="ChevronRight"
          size={16}
          className="sv-collapsible__chevron"
        />
        <span className="sv-collapsible__heading">
          <span className="sv-collapsible__title">{title}</span>
          <span className="sv-collapsible__summary">{summary}</span>
        </span>
      </button>

      {/* Unmounted rather than hidden: a closed section should not be running
          timers, holding a companion server's status, or fetching a quota. */}
      {open && <div className="sv-collapsible__body">{children}</div>}
    </section>
  )
}
