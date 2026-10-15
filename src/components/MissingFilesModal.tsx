// Missing Files review (spec docs/superpowers/specs/2026-10-15-missing-files-design.md),
// opened from Settings → Database. Each track whose file is gone is relinked
// to its file's new place, merged into the library track that has the file
// now, left as it is, or removed from the library. Files on disk are never
// touched.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { getErrorMessage } from '../types/ai'
import { copyPlace } from '../lib/duplicates/copyFacts'
import { formatTime } from '../lib/trackTable/cells'
import { fixSummaryMessage } from '../lib/missingFiles/messages'
import {
  baseName,
  isInsideFolders,
  parentFolder,
} from '../lib/missingFiles/paths'
import {
  actionLabel,
  buildFixes,
  chooseFile,
  emptyChoice,
  locate,
  rowViews,
  setState,
  withLocated,
  type FixState,
  type MissingChoice,
  type RowView,
} from '../lib/missingFiles/missingChoice'
import type { MissingCandidate, MissingTrack } from '../types/track'
import { useSettingsContext } from './settings/SettingsContext'
import { Icon } from './Icon'
import './DuplicatesModal.css'
import './MissingFilesModal.css'

interface MissingFilesModalProps {
  onClose: () => void
  onTracksChanged: () => void
  onNotification: (
    message: string,
    type: 'success' | 'warning' | 'info' | 'error',
  ) => void
}

type FilterValue = 'all' | 'found' | 'missing'

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'aiff', 'aif', 'm4a', 'ogg']

const STATES: FixState[] = ['fix', 'leave', 'remove']

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function placeText(path: string): string {
  const p = copyPlace(path)
  return p.folder ? `${p.folder} / ${p.file}` : p.file
}

export function MissingFilesModal({
  onClose,
  onTracksChanged,
  onNotification,
}: MissingFilesModalProps) {
  const { folders, addFolderAndScan } = useSettingsContext()
  const [tracks, setTracks] = useState<MissingTrack[]>([])
  const [choice, setChoice] = useState<MissingChoice>(emptyChoice)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 'Applying…' or 'Adding <folder>…'; the modal can't close meanwhile. */
  const [busy, setBusy] = useState<string | null>(null)

  const closeUnlessBusy = () => {
    if (!busy) onClose()
  }
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(true, closeUnlessBusy)

  // The parent passes a new onNotification every render (about 4 times a
  // second while music plays). Held in a ref, it can't retrigger the load
  // and wipe the user's choices.
  const notifyRef = useRef(onNotification)
  useEffect(() => {
    notifyRef.current = onNotification
  })
  // A reload reads the files picked so far without being rebuilt per pick.
  const choiceRef = useRef(choice)
  useEffect(() => {
    choiceRef.current = choice
  })

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await tauriApi.getMissingTracks()
      // Picked files are described again: an apply or a scan may have made
      // them library tracks. A file that is gone is dropped.
      const located = new Map<number, MissingCandidate>()
      for (const [trackId, file] of choiceRef.current.located) {
        if (!data.some((t) => t.id === trackId)) continue
        try {
          located.set(trackId, await tauriApi.describeFile(trackId, file.path))
        } catch {
          // The file is gone: the row falls back to its own files.
        }
      }
      setTracks(data)
      setChoice((c) => withLocated(c, located))
    } catch (err) {
      setLoadError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const views = useMemo(() => rowViews(tracks, choice), [tracks, choice])
  const fixes = useMemo(() => buildFixes(tracks, choice), [tracks, choice])
  const hasFile = (t: MissingTrack) =>
    (views.get(t.id)?.candidates.length ?? 0) > 0
  const found = tracks.filter(hasFile)
  const notFound = tracks.filter((t) => !hasFile(t))
  const nothing =
    fixes.relinks.length + fixes.merges.length + fixes.removes.length === 0

  /** Offers a folder outside the library as a library folder, then reloads. */
  async function offerFolder(folder: string): Promise<boolean> {
    const name = baseName(folder)
    const yes = await ask(
      `Add "${name}" to your library folders? Its tracks are imported, and moved files are followed.`,
      { title: 'Add to library', kind: 'info', okLabel: 'Add', cancelLabel: 'Cancel' },
    )
    if (!yes) return false
    setBusy(`Adding ${name}…`)
    let added = true
    try {
      await addFolderAndScan(folder)
    } catch (err) {
      added = false
      notifyRef.current(getErrorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
    // Reload either way: when only the scan failed, the folder is in the library.
    await load()
    return added
  }

  async function searchFolder() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: 'Search another folder',
    })
    if (typeof picked !== 'string') return
    if (isInsideFolders(picked, folders)) {
      notifyRef.current('Already in your library folders', 'info')
      return
    }
    await offerFolder(picked)
  }

  async function pickFile(track: MissingTrack) {
    const picked = await open({
      directory: false,
      multiple: false,
      title: `Locate "${track.title || baseName(track.file_path)}"`,
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    })
    if (typeof picked !== 'string') return
    if (!isInsideFolders(picked, folders)) {
      const added = await offerFolder(parentFolder(picked))
      if (!added) return
    }
    try {
      const file = await tauriApi.describeFile(track.id, picked)
      setChoice((c) => locate(c, track.id, file))
    } catch (err) {
      notifyRef.current(getErrorMessage(err), 'error')
    }
  }

  async function apply() {
    if (busy || nothing) return
    setBusy('Applying…')
    try {
      const summary = await tauriApi.applyMissingFixes(fixes)
      notifyRef.current(
        fixSummaryMessage(summary),
        summary.skipped.length > 0 ? 'warning' : 'success',
      )
      onTracksChanged()
      await load()
    } catch (err) {
      notifyRef.current(getErrorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const tabs: { value: FilterValue; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: tracks.length },
    { value: 'found', label: 'Found', count: found.length },
    { value: 'missing', label: 'Not found', count: notFound.length },
  ]
  const summary = `${plural(tracks.length, 'track points', 'tracks point')} to a file that isn't there · ${found.length} found by file name`
  const showFound = filter !== 'missing' && found.length > 0
  const showNotFound = filter !== 'found' && notFound.length > 0
  const rowProps = (track: MissingTrack) => ({
    track,
    view: views.get(track.id) as RowView,
    disabled: busy !== null,
    onState: (state: FixState) => setChoice((c) => setState(c, track.id, state)),
    onChoose: (path: string) => setChoice((c) => chooseFile(c, track.id, path)),
    onPick: () => void pickFile(track),
  })

  return (
    <div className="modal-overlay" onClick={closeUnlessBusy}>
      <div
        className="modal-content dup-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dup-modal__header">
          <div>
            <h3>Missing Files</h3>
            <p className="dup-modal__summary">{busy ?? summary}</p>
          </div>
          <button
            type="button"
            className="dup-modal__close"
            onClick={closeUnlessBusy}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="dup-modal__toolbar">
          <div className="dup-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={filter === tab.value}
                className={`dup-tab ${filter === tab.value ? 'dup-tab--active' : ''}`}
                onClick={() => setFilter(tab.value)}
              >
                {tab.label}
                <span className="dup-tab__count">{tab.count}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="dup-text-btn"
            onClick={() => void searchFolder()}
            disabled={loading || busy !== null}
          >
            Search another folder…
          </button>
        </div>

        <div className="dup-modal__body">
          {loading ? (
            <div className="dup-modal__state">
              <Icon name="Loader" size={28} />
              <p>Looking for missing files…</p>
            </div>
          ) : loadError ? (
            <div className="dup-modal__state">
              <Icon name="CircleAlert" size={28} />
              <p>{loadError}</p>
              <button type="button" className="btn" onClick={() => void load()}>
                Retry
              </button>
            </div>
          ) : tracks.length === 0 ? (
            <div className="dup-modal__state dup-modal__state--success">
              <Icon name="CircleCheck" size={36} />
              <p>No missing files</p>
            </div>
          ) : !showFound && !showNotFound ? (
            <div className="dup-modal__state">
              <Icon name="ListFilter" size={24} />
              <p>Nothing on this tab.</p>
            </div>
          ) : (
            <div className="dup-modal__groups">
              {showFound && (
                <section className="dup-card mf-card--found">
                  <header className="dup-card__header">
                    <div className="mf-card__head">
                      <span className="mf-card__title">
                        Found by file name
                        <span className="mf-card__count">{found.length}</span>
                      </span>
                      <span className="mf-card__hint">
                        Same file name somewhere in your folders
                      </span>
                    </div>
                  </header>
                  <ul className="dup-card__rows">
                    {found.map((t) => (
                      <MissingRow key={t.id} {...rowProps(t)} />
                    ))}
                  </ul>
                </section>
              )}
              {showNotFound && (
                <section className="dup-card mf-card--missing">
                  <header className="dup-card__header">
                    <div className="mf-card__head">
                      <span className="mf-card__title">
                        Not found
                        <span className="mf-card__count">{notFound.length}</span>
                      </span>
                      <span className="mf-card__hint">
                        Moved off this Mac, or deleted
                      </span>
                    </div>
                  </header>
                  <ul className="dup-card__rows">
                    {notFound.map((t) => (
                      <MissingRow key={t.id} {...rowProps(t)} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        <footer className="dup-modal__footer">
          <span className="mf-footer__hint">
            Relink keeps playlists, plays, analysis and rating. Remove takes a
            track out of the library and its playlists; files on disk are never
            touched.
          </span>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${fixes.removes.length > 0 ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => void apply()}
            disabled={busy !== null || nothing}
          >
            {busy === 'Applying…' ? 'Applying…' : actionLabel(fixes)}
          </button>
        </footer>
      </div>
    </div>
  )
}

function MissingRow({
  track,
  view,
  disabled,
  onState,
  onChoose,
  onPick,
}: {
  track: MissingTrack
  view: RowView
  disabled: boolean
  onState: (state: FixState) => void
  onChoose: (path: string) => void
  onPick: () => void
}) {
  const c = view.candidate
  const facts: { text: string; tone?: 'warn' | 'danger' | 'moves' }[] = []
  if (view.blockedBy) {
    facts.push({
      text: `same file as ${view.blockedBy.title || baseName(view.blockedBy.file_path)}`,
      tone: 'warn',
    })
  }
  if (c && view.lengthDiffers) {
    facts.push({
      text: `length differs: ${formatTime(track.duration_ms)} in library, ${formatTime(c.duration_ms ?? undefined)} found`,
      tone: 'warn',
    })
  }
  if (track.drive_missing) {
    facts.push({ text: `on drive ${track.drive_missing}, not connected` })
  }
  facts.push({ text: track.analyzed ? 'analyzed' : 'not analyzed' })
  facts.push({
    text: track.plays > 0 ? plural(track.plays, 'play', 'plays') : 'no plays',
  })
  facts.push({
    text:
      track.playlists.length > 0
        ? `in ${track.playlists.map((p) => p.name).join(', ')}`
        : 'no playlists',
  })
  if (view.state === 'fix' && view.merge) {
    facts.push({ text: 'plays, playlists and analysis move into it', tone: 'moves' })
  }
  if (view.state === 'remove' && track.playlists.length > 0) {
    facts.push({
      text: `leaves ${plural(track.playlists.length, 'playlist', 'playlists')}`,
      tone: 'danger',
    })
  }
  const old = copyPlace(track.file_path)
  const place = c ? copyPlace(c.path) : null

  return (
    <li className={`dup-row mf-row--${view.state}`}>
      <div className="dup-row__main">
        <div className="mf-title">
          <span className="mf-title__text">
            <strong>{track.title || 'Untitled'}</strong>
            <span className="mf-artist">
              {' '}
              — {track.artist || 'Unknown artist'}
            </span>
          </span>
          {view.merge && (
            <span className="mf-pill mf-pill--lib">Already in library</span>
          )}
          {view.lengthDiffers && (
            <span className="mf-pill mf-pill--warn">Length differs</span>
          )}
        </div>
        <div className="mf-path">
          <span className="mf-old" data-tip={track.file_path}>
            {old.folder ? `${old.folder} / ${old.file}` : old.file}
          </span>
          {c && place && (
            <>
              <span className="mf-arrow" aria-hidden="true">
                →
              </span>
              {view.candidates.length > 1 ? (
                <select
                  className="mf-select"
                  aria-label="Which file is this track"
                  value={c.path}
                  onChange={(e) => onChoose(e.target.value)}
                  disabled={disabled}
                >
                  {view.candidates.map((f) => (
                    <option key={f.path} value={f.path}>
                      {placeText(f.path)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="mf-new" data-tip={c.path}>
                  {place.folder && (
                    <span className="mf-folder">{place.folder} / </span>
                  )}
                  {place.file}
                </span>
              )}
              <button
                type="button"
                className="mf-link"
                onClick={onPick}
                disabled={disabled}
              >
                Other file…
              </button>
            </>
          )}
        </div>
        <div className="dup-row__facts">
          {facts.map((f, i) => (
            <span
              key={i}
              className={`dup-fact ${f.tone ? `dup-fact--${f.tone}` : ''}`}
            >
              {f.text}
            </span>
          ))}
        </div>
      </div>
      <div className="mf-controls">
        {!c && (
          <button
            type="button"
            className="mf-locate"
            onClick={onPick}
            disabled={disabled}
          >
            Locate…
          </button>
        )}
        <div
          className="dup-seg"
          role="group"
          aria-label="What happens to this track"
        >
          {STATES.map((s) => (
            <button
              key={s}
              type="button"
              className={`dup-seg__btn ${view.state === s ? `mf-seg--${s}` : ''}`}
              aria-pressed={view.state === s}
              onClick={() => onState(s)}
              disabled={
                disabled || (s === 'fix' && (!c || view.blockedBy !== undefined))
              }
            >
              {s === 'fix'
                ? view.merge
                  ? 'Merge'
                  : 'Relink'
                : s === 'leave'
                  ? 'Leave'
                  : 'Remove'}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
