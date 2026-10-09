// src/lib/drag/dropTargets.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Track } from '../../types/track'
import { restKeyAt, targetAt, type DragPayload } from './dropTargets'

function track(id: number, file_path: string): Track {
  return { id, file_path, file_hash: `h${id}`, play_count: 0, rating: 0 }
}

const payload: DragPayload = {
  tracks: [track(1, '/Music/House/a.mp3'), track(2, '/Music/House/b.mp3')],
  table: 't1',
  reorder: true,
  playlistId: 5,
}

// An element of the page built below: a sidebar's rows and two tables.
function el(id: string): Element {
  return document.getElementById(id)!
}

beforeEach(() => {
  document.body.innerHTML = `
    <div data-drop="playlist" data-drop-id="7"><span id="in-playlist">Peak Time</span></div>
    <div data-drop="playlist" data-drop-id="5" id="shown-playlist"></div>
    <div data-drop="none" data-drop-open="playlist-folder:9" id="playlist-folder"></div>
    <div data-drop="folder" data-drop-path="/Music/Techno" data-drop-name="Techno"
         data-drop-open="library-node:/Music/Techno"><span id="in-folder">Techno</span></div>
    <div data-drop="folder" data-drop-path="/Music/House" data-drop-name="House" id="shared-folder"></div>
    <div data-drop="folder" data-drop-path="C:\\Music\\House" id="shared-on-windows"></div>
    <div data-drop="rows" data-drop-table="t1"><div id="own-row"></div></div>
    <div data-drop="rows" data-drop-table="t2"><div id="other-row"></div></div>
    <div data-drop="playlist" id="broken"></div>
    <p id="nothing"></p>`
})

describe('where dragged tracks land', () => {
  it('finds a playlist from anything inside its row', () => {
    const found = targetAt(el('in-playlist'), payload)
    expect(found?.target).toEqual({ kind: 'playlist', id: 7 })
    expect(found?.valid).toBe(true)
    expect(found?.element.dataset.dropId).toBe('7')
  })

  it('finds a library folder with its path and name', () => {
    expect(targetAt(el('in-folder'), payload)).toMatchObject({
      target: { kind: 'folder', path: '/Music/Techno', name: 'Techno' },
      valid: true,
    })
  })

  it('refuses the playlist shown, the folder the tracks share and a playlist folder', () => {
    expect(targetAt(el('shown-playlist'), payload)?.valid).toBe(false)
    expect(targetAt(el('shared-folder'), payload)?.valid).toBe(false)
    expect(targetAt(el('playlist-folder'), payload)?.valid).toBe(false)
  })

  it('knows the shared folder in a Windows path too', () => {
    const tracks = [track(1, 'C:/Music/House/a.mp3')]
    expect(targetAt(el('shared-on-windows'), { ...payload, tracks })?.valid).toBe(false)
  })

  it('reorders only in the table the drag started in, and only when it may', () => {
    expect(targetAt(el('own-row'), payload)).toMatchObject({
      target: { kind: 'rows', table: 't1' },
      valid: true,
    })
    expect(targetAt(el('own-row'), { ...payload, reorder: false })?.valid).toBe(false)
    expect(targetAt(el('other-row'), payload)).toBeNull()
  })

  it('leaves a table outside a playlist alone: no reorder, no not-allowed', () => {
    expect(targetAt(el('own-row'), { ...payload, playlistId: null, reorder: false })).toBeNull()
  })

  it('finds nothing outside a target, or in one missing its id', () => {
    expect(targetAt(el('nothing'), payload)).toBeNull()
    expect(targetAt(el('broken'), payload)).toBeNull()
    expect(targetAt(null, payload)).toBeNull()
  })
})

describe('resting on a closed folder', () => {
  it('reads what opens it', () => {
    expect(restKeyAt(el('in-folder'))).toBe('library-node:/Music/Techno')
    expect(restKeyAt(el('playlist-folder'))).toBe('playlist-folder:9')
    expect(restKeyAt(el('in-playlist'))).toBeNull()
  })
})
