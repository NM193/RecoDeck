// src/components/track-table/trackMenuEntries.ts
// The track table's right-click menu (track table spec, Right-click menu):
// every item acts on all the selected tracks at once. Add / Edit Comment and
// Generate AI Playlist take one track: greyed with several selected.
import type { LibraryFolder, Playlist, Track } from '../../types/track'
import { sharedFolder } from '../../lib/trackTable/moveMessages'
import type { MenuEntry } from '../menu/Menu'

export interface TrackMenuActions {
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onAnalyze?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  /** Set Genre ▸ Custom…: asks for a name. */
  onCustomGenre?: (tracks: Track[]) => void
  onClearGenre?: (tracks: Track[]) => void
  onMoveToFolder?: (tracks: Track[], folder: LibraryFolder) => void
  /** Only in a playlist. */
  onRemoveFromPlaylist?: (tracks: Track[]) => void
  onEditComment?: (track: Track) => void
  onGenerateAIPlaylist?: (track: Track) => void
}

interface TrackMenuInput extends TrackMenuActions {
  /** The selection, in the table's order: at least one track. */
  tracks: Track[]
  /** The playlists to add to: no folders, and not the one shown. */
  playlists: Playlist[]
  genres: Array<{ name: string; color?: string }>
  /** The library's folders for Move to folder ▸; null while they are read. */
  folders?: LibraryFolder[] | null
}

export function trackMenuEntries({
  tracks,
  playlists,
  genres,
  folders = null,
  ...actions
}: TrackMenuInput): MenuEntry[] {
  const one = tracks.length === 1
  // The genre every selected track has, if they share one.
  const genre = tracks.every((t) => t.genre === tracks[0].genre) ? tracks[0].genre : undefined
  const entries: MenuEntry[] = []

  if (actions.onAddToPlaylist) {
    const add = actions.onAddToPlaylist
    entries.push(
      playlists.length > 0
        ? {
            kind: 'submenu',
            label: 'Add to Playlist',
            icon: 'ListPlus',
            entries: playlists.map((p) => ({
              kind: 'action',
              label: p.name,
              icon: 'ListMusic',
              onSelect: () => add(tracks, p.id),
            })),
          }
        : {
            kind: 'action',
            label: 'Add to Playlist',
            icon: 'ListPlus',
            hint: 'no playlists',
            disabled: true,
            onSelect: () => {},
          },
    )
  }

  if (actions.onAnalyze) {
    const analyze = actions.onAnalyze
    entries.push({
      kind: 'action',
      label: 'Analyze BPM & Key',
      icon: 'Zap',
      onSelect: () => analyze(tracks),
    })
  }

  if (actions.onSetGenre) {
    const setGenre = actions.onSetGenre
    const custom = actions.onCustomGenre
    entries.push({
      kind: 'submenu',
      label: 'Set Genre',
      icon: 'Tag',
      hint: genre,
      entries: [
        ...genres.map(
          (g): MenuEntry => ({
            kind: 'action',
            label: g.name,
            icon: 'Music',
            swatch: g.color,
            checked: g.name === genre,
            onSelect: () => setGenre(tracks, g.name),
          }),
        ),
        ...(genres.length > 0 ? [{ kind: 'separator' } as const] : []),
        {
          kind: 'action',
          label: 'Custom…',
          icon: 'Pencil',
          onSelect: () => custom?.(tracks),
        },
      ],
    })
  }

  if (actions.onClearGenre && tracks.some((t) => t.genre)) {
    const clear = actions.onClearGenre
    entries.push({ kind: 'action', label: 'Clear Genre', icon: 'X', onSelect: () => clear(tracks) })
  }

  if (actions.onMoveToFolder) {
    const move = actions.onMoveToFolder
    // Every selected track in one folder: that folder is greyed.
    const here = sharedFolder(tracks)
    entries.push({
      kind: 'submenu',
      label: 'Move to folder',
      icon: 'FolderInput',
      // While the list is read, the box says so, whatever is typed.
      search: {
        placeholder: 'Find a folder',
        empty: folders === null ? 'Reading folders…' : 'No folder matches',
      },
      entries: (folders ?? []).map((folder) => ({
        kind: 'action',
        label: folder.label,
        icon: 'Folder',
        disabled: folder.path === here,
        onSelect: () => move(tracks, folder),
      })),
    })
  }

  if (actions.onEditComment) {
    const edit = actions.onEditComment
    entries.push({
      kind: 'action',
      label: one && tracks[0].comment ? 'Edit Comment' : 'Add Comment',
      icon: 'MessageSquare',
      disabled: !one,
      onSelect: () => edit(tracks[0]),
    })
  }

  if (actions.onRemoveFromPlaylist) {
    const remove = actions.onRemoveFromPlaylist
    entries.push(
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Delete from playlist',
        icon: 'Trash2',
        danger: true,
        onSelect: () => remove(tracks),
      },
    )
  }

  if (actions.onGenerateAIPlaylist) {
    const generate = actions.onGenerateAIPlaylist
    entries.push(
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Generate AI Playlist',
        icon: 'Sparkles',
        disabled: !one,
        onSelect: () => generate(tracks[0]),
      },
    )
  }

  return entries
}
