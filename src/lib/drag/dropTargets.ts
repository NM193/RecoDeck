// src/lib/drag/dropTargets.ts
// Where dragged tracks can land (Interactions spec, Drag and drop). Targets
// say so with data-drop-* attributes and are found from the element under
// the pointer, so lists that scroll and a flyout that opens mid-drag need no
// measuring:
//   data-drop="playlist" data-drop-id="7"           tracks are added
//   data-drop="folder" data-drop-path data-drop-name tracks are moved there
//   data-drop="rows" data-drop-table                 a playlist's own table reorders
//   data-drop="none"                                 takes nothing (a playlist folder)
//   data-drop-open="<kind>:<value>"                  resting on it opens it
//   data-drop-scroll                                 a list that scrolls near its edge
import type { Track } from '../../types/track'
import { sharedFolder } from '../trackTable/moveMessages'

export interface DragPayload {
  tracks: Track[]
  /** The table the drag started in (its rows are a target only there). */
  table: string
  /** That table may reorder its rows: a playlist in its own order, unnarrowed. */
  reorder: boolean
  /** The playlist that table shows: dropping on it would add nothing. */
  playlistId: number | null
}

export type DropTarget =
  | { kind: 'playlist'; id: number }
  | { kind: 'folder'; path: string; name: string }
  | { kind: 'rows'; table: string }

export interface FoundTarget {
  target: DropTarget | null
  /** The element carrying data-drop, which lights up when valid. */
  element: HTMLElement
  /** False where the tracks cannot land: the pointer shows not-allowed. */
  valid: boolean
}

/** The target at `element` (or around it), for these tracks; null where there is none. */
export function targetAt(element: Element | null, payload: DragPayload): FoundTarget | null {
  const holder = element?.closest<HTMLElement>('[data-drop]')
  if (!holder) return null
  const data = holder.dataset
  switch (data.drop) {
    case 'playlist': {
      const id = Number(data.dropId)
      if (!data.dropId || !Number.isInteger(id)) return null
      return { target: { kind: 'playlist', id }, element: holder, valid: id !== payload.playlistId }
    }
    case 'folder': {
      const path = data.dropPath
      if (!path) return null
      const target: DropTarget = { kind: 'folder', path, name: data.dropName || path }
      // Tracks store `/` on Windows too; the folder tree may not.
      const shared = path.replace(/\\/g, '/') === sharedFolder(payload.tracks)
      return { target, element: holder, valid: !shared }
    }
    case 'rows': {
      // Only a playlist's own table reorders, and refuses while it may not.
      if (data.dropTable !== payload.table || payload.playlistId === null) return null
      return { target: { kind: 'rows', table: payload.table }, element: holder, valid: payload.reorder }
    }
    case 'none':
      return { target: null, element: holder, valid: false }
    default:
      return null
  }
}

/** What resting at `element` opens ("<kind>:<value>"), or null. */
export function restKeyAt(element: Element | null): string | null {
  return element?.closest('[data-drop-open]')?.getAttribute('data-drop-open') ?? null
}
