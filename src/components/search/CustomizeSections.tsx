// src/components/search/CustomizeSections.tsx
// Search's Customize (Search spec): the sections as a plain list, each with
// ▲ / ▼ to move it and a switch. No grid and no drag. Done saves; Cancel
// leaves the page as it was.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { ToggleSwitch } from '../settings/ToggleSwitch'
import {
  moveSection,
  sectionLabel,
  setSectionOn,
  type SearchSectionId,
  type SectionPref,
} from '../../lib/search/sections'

interface CustomizeSectionsProps {
  prefs: SectionPref[]
  onDone: (prefs: SectionPref[]) => void
  onCancel: () => void
}

export function CustomizeSections({
  prefs,
  onDone,
  onCancel,
}: CustomizeSectionsProps) {
  const [draft, setDraft] = useState(prefs)
  // The arrow just used keeps the focus as its row moves (moving a row's node
  // drops it). At the top or bottom it stays focusable: aria-disabled.
  const [moved, setMoved] = useState<{
    id: SearchSectionId
    by: -1 | 1
  } | null>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!moved) return
    list.current
      ?.querySelector<HTMLButtonElement>(
        `[data-move="${moved.id}:${moved.by}"]`,
      )
      ?.focus()
  }, [moved])

  function move(index: number, by: -1 | 1) {
    const next = moveSection(draft, index, by)
    if (next === draft) return
    setDraft(next)
    setMoved({ id: draft[index].id, by })
  }

  return (
    <div className="search-customize">
      <div className="search-customize__head">
        <h3 className="search-section__title">Sections on Search</h3>
        <div className="search-customize__actions">
          <button type="button" className="btn btn--sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => onDone(draft)}
          >
            Done
          </button>
        </div>
      </div>
      <ul ref={list} className="search-customize__list">
        {draft.map((pref, index) => {
          const label = sectionLabel(pref.id)
          return (
            <li key={pref.id} className="search-customize__row">
              <span
                className={
                  pref.on
                    ? 'search-customize__label'
                    : 'search-customize__label search-customize__label--off'
                }
              >
                {label}
              </span>
              <button
                type="button"
                className="search-customize__move"
                aria-label={`Move ${label} up`}
                aria-disabled={index === 0}
                data-move={`${pref.id}:-1`}
                onClick={() => move(index, -1)}
              >
                <Icon name="ChevronUp" size={16} />
              </button>
              <button
                type="button"
                className="search-customize__move"
                aria-label={`Move ${label} down`}
                aria-disabled={index === draft.length - 1}
                data-move={`${pref.id}:1`}
                onClick={() => move(index, 1)}
              >
                <Icon name="ChevronDown" size={16} />
              </button>
              <ToggleSwitch
                checked={pref.on}
                label={`Show ${label}`}
                onChange={(on) => setDraft(setSectionOn(draft, pref.id, on))}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
