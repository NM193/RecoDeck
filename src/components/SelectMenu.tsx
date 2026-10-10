// A select in the app's own style, in place of the system's: the box shows
// the choice and the list opens under it (Interactions spec, menus): ↑ ↓
// move, Enter chooses, Esc or a press outside closes. With `searchable`, a
// box at the top of the list narrows a long one.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Icon } from './Icon'
import { Popover } from './Popover'
import { GLIDE } from '../lib/glide/glide'
import { useGlideTo } from '../lib/glide/useGlide'
import './SelectMenu.css'

// Longer labels may be cut at the list's width; they get a tooltip.
const LONG_LABEL = 36

export interface SelectOption {
  value: string
  label: string
  /** Shown muted at the right, e.g. a count. */
  hint?: string
}

interface SelectMenuProps {
  /** Names the list for screen readers. */
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  /** A box at the top of the list narrows it as you type. */
  searchable?: boolean
  /** The box's id, for a `<label htmlFor>`. */
  id?: string
}

export function SelectMenu({
  label,
  value,
  options,
  onChange,
  searchable = false,
  id,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const anchorRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // The active option's highlight slides (Micro-interactions spec, Menus).
  const glideRef = useRef<HTMLLIElement>(null)
  useGlideTo(listRef, glideRef, '.select-menu__option--active', GLIDE.menu)
  const listId = useId()

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase()
    return words
      ? options.filter((option) => option.label.toLowerCase().includes(words))
      : options
  }, [options, query])
  const activeIndex = Math.min(active, shown.length - 1)
  const chosen = options.find((option) => option.value === value)

  const openList = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    setOpen(true)
  }
  const close = useCallback(() => setOpen(false), [])
  const choose = (option: SelectOption) => {
    onChange(option.value)
    setOpen(false)
    boxRef.current?.focus()
  }

  // The active row stays in view as ↑ ↓ move it.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  // Without a search box, the list takes the keys.
  useEffect(() => {
    if (open && !searchable) listRef.current?.focus()
  }, [open, searchable])

  const onListKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(Math.min(activeIndex + 1, shown.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = shown[activeIndex]
      if (option) choose(option)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  const optionId = (index: number) => `${listId}-option-${index}`

  return (
    <div ref={anchorRef} className="select-menu">
      <button
        ref={boxRef}
        id={id}
        type="button"
        className={value === '' ? 'select-menu__box select-menu__box--empty' : 'select-menu__box'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            openList()
          }
        }}
      >
        <span className="select-menu__value">{chosen?.label ?? value}</span>
        <Icon name="ChevronDown" size={14} className="select-menu__chevron" />
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label={label}
        className="select-menu__list"
      >
        {searchable && (
          <input
            className="select-menu__search"
            type="text"
            placeholder="Search"
            aria-label={`Search ${label}`}
            aria-controls={listId}
            aria-activedescendant={shown.length > 0 ? optionId(activeIndex) : undefined}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onListKeyDown}
          />
        )}
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={shown.length > 0 ? optionId(activeIndex) : undefined}
          tabIndex={-1}
          className="glide-track select-menu__options"
          onKeyDown={onListKeyDown}
        >
          <li ref={glideRef} role="presentation" aria-hidden="true" className="glide" />
          {shown.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              data-index={index}
              role="option"
              aria-selected={option.value === value}
              data-tip={option.label.length > LONG_LABEL ? option.label : undefined} data-tip-overflow
              className={
                index === activeIndex
                  ? 'select-menu__option select-menu__option--active'
                  : 'select-menu__option'
              }
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option.value === value && (
                <Icon name="Check" size={13} className="select-menu__check" />
              )}
              <span className="select-menu__label">{option.label}</span>
              {option.hint && <span className="select-menu__hint">{option.hint}</span>}
            </li>
          ))}
          {shown.length === 0 && <li className="select-menu__empty">No match</li>}
        </ul>
      </Popover>
    </div>
  )
}
