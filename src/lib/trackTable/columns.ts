// src/lib/trackTable/columns.ts
// The track table's columns (track table spec, Columns): which exist, their
// defaults, and the one layout every track table shares — order, shown or
// hidden, widths, and the artwork switch. Stored in the settings table.

export type ColumnId =
  | 'title'
  | 'bpm'
  | 'key'
  | 'genre'
  | 'label'
  | 'time'
  | 'added'
  | 'album'
  | 'rating'
  | 'comment'
  | 'plays'
  | 'format'

export interface ColumnDef {
  id: ColumnId
  /** In the Columns panel. */
  name: string
  /** In the column head. */
  head: string
  shownByDefault: boolean
  /** Pixels. Title & artist's is its minimum: it takes the remaining width. */
  width: number
  minWidth: number
  align: 'start' | 'end'
}

/** In their default order. */
export const COLUMNS: readonly ColumnDef[] = [
  { id: 'title', name: 'Title & artist', head: 'Title', shownByDefault: true, width: 240, minWidth: 240, align: 'start' },
  { id: 'bpm', name: 'BPM', head: 'BPM', shownByDefault: true, width: 72, minWidth: 56, align: 'end' },
  { id: 'key', name: 'Key', head: 'Key', shownByDefault: true, width: 56, minWidth: 48, align: 'start' },
  { id: 'genre', name: 'Genre', head: 'Genre', shownByDefault: true, width: 150, minWidth: 80, align: 'start' },
  { id: 'label', name: 'Label', head: 'Label', shownByDefault: true, width: 160, minWidth: 80, align: 'start' },
  { id: 'time', name: 'Time', head: 'Time', shownByDefault: true, width: 64, minWidth: 56, align: 'end' },
  { id: 'added', name: 'Added', head: 'Added', shownByDefault: true, width: 96, minWidth: 80, align: 'start' },
  { id: 'album', name: 'Album', head: 'Album', shownByDefault: false, width: 180, minWidth: 80, align: 'start' },
  { id: 'rating', name: 'Rating', head: 'Rating', shownByDefault: false, width: 104, minWidth: 104, align: 'start' },
  { id: 'comment', name: 'Comment', head: 'Comment', shownByDefault: false, width: 180, minWidth: 80, align: 'start' },
  { id: 'plays', name: 'Plays', head: 'Plays', shownByDefault: false, width: 64, minWidth: 56, align: 'end' },
  { id: 'format', name: 'Format · bitrate', head: 'Format', shownByDefault: false, width: 104, minWidth: 80, align: 'start' },
]

const BY_ID = new Map(COLUMNS.map((column) => [column.id, column]))

export function columnDef(id: ColumnId): ColumnDef {
  return BY_ID.get(id)!
}

export interface ColumnLayout {
  id: ColumnId
  shown: boolean
  width: number
}

export interface TrackTableLayout {
  artwork: boolean
  /** Every column, in the panel's order; a hidden one keeps its place. */
  columns: ColumnLayout[]
}

/** The settings table's key. */
export const LAYOUT_SETTING = 'track_table_columns'

/** The # column's width; the artwork's, when on. */
export const INDEX_WIDTH = 44
export const ARTWORK_WIDTH = 48

export function defaultLayout(): TrackTableLayout {
  return {
    artwork: true,
    columns: COLUMNS.map((column) => ({
      id: column.id,
      shown: column.shownByDefault,
      width: column.width,
    })),
  }
}

function isColumnId(value: unknown): value is ColumnId {
  return typeof value === 'string' && BY_ID.has(value as ColumnId)
}

/**
 * The stored layout, made safe: unknown ids are dropped, a column the app
 * gained since is appended hidden, a width under the minimum is raised to
 * it, Title & artist is always shown. Anything unreadable gives the default.
 */
export function parseLayout(json: string | null): TrackTableLayout {
  if (!json) return defaultLayout()
  let stored: unknown
  try {
    stored = JSON.parse(json)
  } catch {
    return defaultLayout()
  }
  if (typeof stored !== 'object' || stored === null) return defaultLayout()
  const { artwork, columns } = stored as { artwork?: unknown; columns?: unknown }
  if (!Array.isArray(columns)) return defaultLayout()

  const seen = new Set<ColumnId>()
  const parsed: ColumnLayout[] = []
  for (const entry of columns) {
    if (typeof entry !== 'object' || entry === null) continue
    const { id, shown, width } = entry as { id?: unknown; shown?: unknown; width?: unknown }
    if (!isColumnId(id) || seen.has(id)) continue
    seen.add(id)
    const def = columnDef(id)
    parsed.push({
      id,
      shown: id === 'title' || (typeof shown === 'boolean' ? shown : def.shownByDefault),
      width:
        typeof width === 'number' && Number.isFinite(width)
          ? Math.max(def.minWidth, Math.round(width))
          : def.width,
    })
  }
  for (const def of COLUMNS) {
    if (!seen.has(def.id)) {
      parsed.push({ id: def.id, shown: def.id === 'title', width: def.width })
    }
  }
  return { artwork: typeof artwork === 'boolean' ? artwork : true, columns: parsed }
}

/** Moves the column at `from` to `to` (indexes in `layout.columns`). */
export function moveColumn(layout: TrackTableLayout, from: number, to: number): TrackTableLayout {
  const last = layout.columns.length - 1
  const target = Math.max(0, Math.min(last, to))
  if (from === target || from < 0 || from > last) return layout
  const columns = [...layout.columns]
  const [moved] = columns.splice(from, 1)
  columns.splice(target, 0, moved)
  return { ...layout, columns }
}

/** Shows or hides a column; Title & artist stays shown. */
export function setColumnShown(
  layout: TrackTableLayout,
  id: ColumnId,
  shown: boolean,
): TrackTableLayout {
  if (id === 'title') return layout
  return {
    ...layout,
    columns: layout.columns.map((column) => (column.id === id ? { ...column, shown } : column)),
  }
}

/** A column's width, never under its minimum. */
export function setColumnWidth(
  layout: TrackTableLayout,
  id: ColumnId,
  width: number,
): TrackTableLayout {
  const min = columnDef(id).minWidth
  return {
    ...layout,
    columns: layout.columns.map((column) =>
      column.id === id ? { ...column, width: Math.max(min, Math.round(width)) } : column,
    ),
  }
}

export function shownColumns(layout: TrackTableLayout): ColumnLayout[] {
  return layout.columns.filter((column) => column.shown)
}

/**
 * The grid every row and the head use: #, the artwork when on, then the shown
 * columns, Title & artist taking what is left. `minWidth` is the sum: past
 * it, the table scrolls sideways.
 */
export function gridTemplate(layout: TrackTableLayout): { template: string; minWidth: number } {
  const parts = [`${INDEX_WIDTH}px`]
  let minWidth = INDEX_WIDTH
  if (layout.artwork) {
    parts.push(`${ARTWORK_WIDTH}px`)
    minWidth += ARTWORK_WIDTH
  }
  for (const column of shownColumns(layout)) {
    parts.push(column.id === 'title' ? `minmax(${column.width}px, 1fr)` : `${column.width}px`)
    minWidth += column.width
  }
  return { template: parts.join(' '), minWidth }
}
