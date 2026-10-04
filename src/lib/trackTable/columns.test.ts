// src/lib/trackTable/columns.test.ts
import { describe, expect, it } from 'vitest'
import {
  COLUMNS,
  defaultLayout,
  gridTemplate,
  moveColumn,
  parseLayout,
  setColumnShown,
  setColumnWidth,
  shownColumns,
  type TrackTableLayout,
} from './columns'

const ids = (layout: TrackTableLayout) => layout.columns.map((c) => c.id)
const shownIds = (layout: TrackTableLayout) => shownColumns(layout).map((c) => c.id)

describe('the default layout', () => {
  it('shows Title & artist, BPM, Key, Genre, Label, Time and Added, with artwork', () => {
    const layout = defaultLayout()
    expect(layout.artwork).toBe(true)
    expect(shownIds(layout)).toEqual(['title', 'bpm', 'key', 'genre', 'label', 'time', 'added'])
    expect(ids(layout)).toEqual(COLUMNS.map((c) => c.id))
  })
})

describe('reading the stored layout', () => {
  it('keeps the stored order, shown flags, widths and artwork', () => {
    const stored = {
      artwork: false,
      columns: [
        { id: 'genre', shown: true, width: 200 },
        { id: 'title', shown: true, width: 300 },
        { id: 'bpm', shown: false, width: 72 },
      ],
    }
    const layout = parseLayout(JSON.stringify(stored))
    expect(layout.artwork).toBe(false)
    expect(ids(layout).slice(0, 3)).toEqual(['genre', 'title', 'bpm'])
    expect(layout.columns[0]).toEqual({ id: 'genre', shown: true, width: 200 })
    expect(layout.columns[2].shown).toBe(false)
  })

  it('drops unknown ids and repeats', () => {
    const stored = {
      artwork: true,
      columns: [
        { id: 'mood', shown: true, width: 90 },
        { id: 'bpm', shown: true, width: 72 },
        { id: 'bpm', shown: false, width: 90 },
      ],
    }
    const layout = parseLayout(JSON.stringify(stored))
    expect(ids(layout)).not.toContain('mood')
    expect(ids(layout).filter((id) => id === 'bpm')).toHaveLength(1)
    expect(layout.columns[0]).toEqual({ id: 'bpm', shown: true, width: 72 })
  })

  it('appends a column added since, hidden', () => {
    const stored = { artwork: true, columns: [{ id: 'title', shown: true, width: 240 }] }
    const layout = parseLayout(JSON.stringify(stored))
    expect(ids(layout)).toEqual(COLUMNS.map((c) => c.id))
    expect(shownIds(layout)).toEqual(['title'])
  })

  it('always shows Title & artist', () => {
    const stored = { artwork: true, columns: [{ id: 'title', shown: false, width: 240 }] }
    expect(parseLayout(JSON.stringify(stored)).columns[0].shown).toBe(true)
  })

  it('raises a width under the minimum and fills a missing one', () => {
    const stored = {
      artwork: true,
      columns: [
        { id: 'genre', shown: true, width: 10 },
        { id: 'label', shown: true },
      ],
    }
    const layout = parseLayout(JSON.stringify(stored))
    expect(layout.columns[0].width).toBe(80)
    expect(layout.columns[1].width).toBe(160)
  })

  it('gives the default for nothing stored or anything unreadable', () => {
    expect(parseLayout(null)).toEqual(defaultLayout())
    expect(parseLayout('not json')).toEqual(defaultLayout())
    expect(parseLayout('{"columns": 3}')).toEqual(defaultLayout())
  })
})

describe('changing the layout', () => {
  it('moves a column', () => {
    const layout = moveColumn(defaultLayout(), 3, 1)
    expect(ids(layout).slice(0, 4)).toEqual(['title', 'genre', 'bpm', 'key'])
  })

  it('keeps a move inside the list', () => {
    const layout = defaultLayout()
    expect(ids(moveColumn(layout, 0, 99)).at(-1)).toBe('title')
    expect(moveColumn(layout, 2, 2)).toBe(layout)
  })

  it('shows and hides a column, but not Title & artist', () => {
    const layout = setColumnShown(defaultLayout(), 'plays', true)
    expect(shownIds(layout)).toContain('plays')
    expect(shownIds(setColumnShown(layout, 'plays', false))).not.toContain('plays')
    expect(shownIds(setColumnShown(layout, 'title', false))).toContain('title')
  })

  it('never makes a column narrower than its minimum', () => {
    const layout = setColumnWidth(defaultLayout(), 'genre', 20)
    expect(layout.columns.find((c) => c.id === 'genre')!.width).toBe(80)
  })

  it('goes back to the default on Reset', () => {
    const changed = setColumnShown(moveColumn(defaultLayout(), 3, 1), 'album', true)
    expect(changed).not.toEqual(defaultLayout())
    expect(defaultLayout()).toEqual(parseLayout(null))
  })
})

describe('the grid', () => {
  it('lays out #, the artwork and the shown columns, Title & artist taking the rest', () => {
    const { template, minWidth } = gridTemplate(defaultLayout())
    expect(template).toBe('44px 48px minmax(240px, 1fr) 72px 56px 150px 160px 64px 96px')
    expect(minWidth).toBe(44 + 48 + 240 + 72 + 56 + 150 + 160 + 64 + 96)
  })

  it('leaves the artwork out when it is off', () => {
    const { template } = gridTemplate({ ...defaultLayout(), artwork: false })
    expect(template.startsWith('44px minmax(240px, 1fr)')).toBe(true)
  })
})
