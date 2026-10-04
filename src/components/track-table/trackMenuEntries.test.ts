// src/components/track-table/trackMenuEntries.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Playlist, Track } from '../../types/track'
import type { MenuAction, MenuEntry, MenuSubmenu } from '../menu/Menu'
import { trackMenuEntries } from './trackMenuEntries'

const track = (id: number, extra: Partial<Track> = {}) =>
  ({ id, title: `Track ${id}`, file_path: `/Music/${id}.mp3`, ...extra }) as Track
const playlist = (id: number, name: string) => ({ id, name }) as Playlist
const find = (entries: MenuEntry[], label: string) =>
  entries.find((e) => e.kind !== 'separator' && e.label === label) as
    | MenuAction
    | MenuSubmenu
    | undefined

const actions = {
  onAddToPlaylist: vi.fn(),
  onAnalyze: vi.fn(),
  onSetGenre: vi.fn(),
  onCustomGenre: vi.fn(),
  onClearGenre: vi.fn(),
  onEditComment: vi.fn(),
}

describe('the track table right-click menu', () => {
  it('acts on every selected track at once', () => {
    const tracks = [track(1), track(2), track(3)]
    const entries = trackMenuEntries({
      tracks,
      playlists: [playlist(7, 'Peak Time')],
      genres: [{ name: 'House' }],
      ...actions,
    })
    const add = find(entries, 'Add to Playlist') as MenuSubmenu
    ;(add.entries[0] as MenuAction).onSelect()
    expect(actions.onAddToPlaylist).toHaveBeenCalledWith(tracks, 7)
    ;(find(entries, 'Analyze BPM & Key') as MenuAction).onSelect()
    expect(actions.onAnalyze).toHaveBeenCalledWith(tracks)
  })

  it('greys the comment with several selected', () => {
    const several = trackMenuEntries({ tracks: [track(1), track(2)], playlists: [], genres: [], ...actions })
    expect((find(several, 'Add Comment') as MenuAction).disabled).toBe(true)
    const one = trackMenuEntries({
      tracks: [track(1, { comment: 'peak' })],
      playlists: [],
      genres: [],
      ...actions,
    })
    expect((find(one, 'Edit Comment') as MenuAction).disabled).toBe(false)
  })

  it('offers Clear Genre when a selected track has one', () => {
    const none = trackMenuEntries({ tracks: [track(1), track(2)], playlists: [], genres: [], ...actions })
    expect(find(none, 'Clear Genre')).toBeUndefined()
    const some = trackMenuEntries({
      tracks: [track(1), track(2, { genre: 'House' })],
      playlists: [],
      genres: [],
      ...actions,
    })
    expect(find(some, 'Clear Genre')).toBeDefined()
  })

  it('checks the genre every selected track shares', () => {
    const genres = [{ name: 'House' }, { name: 'Techno' }]
    const shared = trackMenuEntries({
      tracks: [track(1, { genre: 'House' }), track(2, { genre: 'House' })],
      playlists: [],
      genres,
      ...actions,
    })
    const setGenre = find(shared, 'Set Genre') as MenuSubmenu
    expect(setGenre.hint).toBe('House')
    expect((setGenre.entries[0] as MenuAction).checked).toBe(true)
    const mixed = trackMenuEntries({
      tracks: [track(1, { genre: 'House' }), track(2, { genre: 'Techno' })],
      playlists: [],
      genres,
      ...actions,
    })
    expect((find(mixed, 'Set Genre') as MenuSubmenu).hint).toBeUndefined()
  })

  it('shows Delete from playlist only where it is given, in red', () => {
    expect(find(trackMenuEntries({ tracks: [track(1)], playlists: [], genres: [], ...actions }), 'Delete from playlist')).toBeUndefined()
    const inPlaylist = trackMenuEntries({
      tracks: [track(1)],
      playlists: [],
      genres: [],
      ...actions,
      onRemoveFromPlaylist: vi.fn(),
    })
    expect((find(inPlaylist, 'Delete from playlist') as MenuAction).danger).toBe(true)
  })

  it('greys Add to Playlist with no playlists to add to', () => {
    const entries = trackMenuEntries({ tracks: [track(1)], playlists: [], genres: [], ...actions })
    expect((find(entries, 'Add to Playlist') as MenuAction).disabled).toBe(true)
  })

  it('moves every selected track to a folder, greying the one they share', () => {
    const onMoveToFolder = vi.fn()
    const tracks = [
      track(1, { file_path: '/Music/House/a.mp3' }),
      track(2, { file_path: '/Music/House/b.mp3' }),
    ]
    const folders = [
      { path: '/Music', label: 'Music' },
      { path: '/Music/House', label: 'Music / House' },
    ]
    const entries = trackMenuEntries({ tracks, playlists: [], genres: [], folders, onMoveToFolder })
    const move = find(entries, 'Move to folder') as MenuSubmenu
    expect(move.search).toBeDefined()
    const [music, house] = move.entries as MenuAction[]
    expect(house.disabled).toBe(true)
    expect(music.disabled).toBe(false)
    music.onSelect()
    expect(onMoveToFolder).toHaveBeenCalledWith(tracks, folders[0])
  })

  it('says it is reading the folders until they come', () => {
    const entries = trackMenuEntries({
      tracks: [track(1)],
      playlists: [],
      genres: [],
      folders: null,
      onMoveToFolder: vi.fn(),
    })
    const move = find(entries, 'Move to folder') as MenuSubmenu
    expect(move.entries).toEqual([])
    expect(move.search?.empty).toBe('Reading folders…')
  })
})
