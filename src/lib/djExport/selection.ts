// The Export to DJ software dialog's playlist tree: which boxes start checked,
// what a folder's box shows and does, what is sent, and what the toast says.

import type { Playlist } from '../../types/track'
import type { DjExportResult } from '../../types/djExport'

export interface ExportTreeNode {
  id: number
  name: string
  isFolder: boolean
  children: ExportTreeNode[]
}

export type CheckState = 'checked' | 'unchecked' | 'mixed'

/** The playlist tree as the sidebar shows it: top level, then by parent, in get_all_playlists' order. */
export function buildTree(playlists: Playlist[]): ExportTreeNode[] {
  const byParent = new Map<number | null, Playlist[]>()
  for (const playlist of playlists) {
    const siblings = byParent.get(playlist.parent_id) ?? []
    siblings.push(playlist)
    byParent.set(playlist.parent_id, siblings)
  }
  const level = (parent: number | null, path: Set<number>): ExportTreeNode[] =>
    (byParent.get(parent) ?? [])
      .filter((playlist) => !path.has(playlist.id))
      .map((playlist) => {
        const isFolder = playlist.playlist_type === 'folder'
        return {
          id: playlist.id,
          name: playlist.name,
          isFolder,
          children: isFolder ? level(playlist.id, new Set(path).add(playlist.id)) : [],
        }
      })
  return level(null, new Set())
}

export function findNode(nodes: ExportTreeNode[], id: number): ExportTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const inside = findNode(node.children, id)
    if (inside) return inside
  }
  return null
}

/** A playlist itself, or every playlist inside a folder, at any depth. */
export function playlistIdsUnder(node: ExportTreeNode): number[] {
  return node.isFolder ? node.children.flatMap(playlistIdsUnder) : [node.id]
}

/**
 * What the dialog starts with: the remembered playlists that still exist, plus
 * the playlist (or every playlist in the folder) whose menu opened it.
 */
export function initialSelection(
  tree: ExportTreeNode[],
  remembered: number[],
  openedFrom: number | null,
): Set<number> {
  const existing = new Set(tree.flatMap(playlistIdsUnder))
  const selected = new Set(remembered.filter((id) => existing.has(id)))
  const from = openedFrom === null ? null : findNode(tree, openedFrom)
  if (from) for (const id of playlistIdsUnder(from)) selected.add(id)
  return selected
}

export function checkState(node: ExportTreeNode, selected: Set<number>): CheckState {
  const ids = playlistIdsUnder(node)
  const checked = ids.filter((id) => selected.has(id)).length
  if (checked === 0) return 'unchecked'
  return checked === ids.length ? 'checked' : 'mixed'
}

/** A click on a box: a playlist flips; a folder checks all of itself, or clears it when all was checked. */
export function toggle(node: ExportTreeNode, selected: Set<number>): Set<number> {
  const next = new Set(selected)
  const ids = playlistIdsUnder(node)
  if (checkState(node, selected) === 'checked') ids.forEach((id) => next.delete(id))
  else ids.forEach((id) => next.add(id))
  return next
}

/** The checked playlists in the tree's order: what is sent and remembered. */
export function selectedInOrder(tree: ExportTreeNode[], selected: Set<number>): number[] {
  return tree.flatMap(playlistIdsUnder).filter((id) => selected.has(id))
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** The toast after an export: a warning, with the list as its detail, when files were gone. */
export function resultToast(
  result: DjExportResult,
  program: string,
): { message: string; kind: 'success' | 'warning'; detail?: string } {
  const message = `${count(result.playlists, 'playlist', 'playlists')}, ${count(result.tracks, 'track', 'tracks')} exported to ${program}`
  if (result.skipped.length === 0) return { message, kind: 'success' }
  return {
    message: `${message} · ${count(result.skipped.length, 'track', 'tracks')} skipped — file missing`,
    kind: 'warning',
    detail: result.skipped
      .map((s) => `${s.artist || 'Unknown artist'} – ${s.title || 'Untitled'} (${s.path})`)
      .join('\n'),
  }
}
