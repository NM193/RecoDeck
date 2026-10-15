// Large modal opened from Settings → Database Maintenance. Shows every
// duplicate group the backend detected across three passes. In each group
// the user keeps one copy and merges the others into it (Duplicates Merge
// spec): merged copies hand over their playlists, tags, plays and analysis,
// and their files are skipped on future scans.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { formatTime } from '../lib/trackTable/cells'
import { getErrorMessage } from '../types/ai'
import {
  allMerged,
  buildMerges,
  groupKey,
  initialChoice,
  mergeCount,
  pickKeep,
  rowState,
  setMergeAll,
  slotsMoving,
  toggleMerge,
  type MergeChoice,
  type RowState,
} from '../lib/duplicates/mergeChoice'
import type {
  DuplicateGroup,
  DuplicateReason,
  DuplicateTrack,
  MergeSummary,
} from '../types/track'
import { Icon } from './Icon'
import './DuplicatesModal.css'

interface DuplicatesModalProps {
  onClose: () => void
  onTracksChanged: () => void
  onNotification: (
    message: string,
    type: 'success' | 'warning' | 'info' | 'error',
  ) => void
}

type FilterValue = 'all' | DuplicateReason

const REASON_LABELS: Record<DuplicateReason, string> = {
  identical_content: 'Identical content',
  identical_filename_size: 'Same filename & size',
  same_title_artist: 'Same title & artist',
}

const FILTER_TABS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'identical_content', label: 'Identical content' },
  { value: 'identical_filename_size', label: 'Same filename & size' },
  { value: 'same_title_artist', label: 'Same title & artist' },
]

const LOSSLESS = new Set(['wav', 'aif', 'aiff', 'flac'])

const STATUS: Record<RowState, string> = {
  keep: 'Stays in your library',
  merge: 'Merges into the kept copy',
  left: 'Left as is',
}

function formatMB(bytes?: number): string {
  if (bytes == null) return '—'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return iso.split(' ')[0] ?? iso.split('T')[0] ?? iso
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "WAV", "AIFF", "MP3 320": lossless formats without their bitrate. */
function formatAudio(track: DuplicateTrack): string {
  const ext = (track.file_format ?? '').toLowerCase()
  const name = ext === 'aif' ? 'AIFF' : ext.toUpperCase() || '—'
  if (LOSSLESS.has(ext) || !track.bitrate) return name
  return `${name} ${track.bitrate}`
}

function statusText(state: RowState, slots: number): string {
  if (state !== 'merge' || slots === 0) return STATUS[state]
  return `${STATUS.merge} · its ${plural(slots, 'playlist slot', 'playlist slots')} ${slots === 1 ? 'moves' : 'move'} over`
}

function summaryMessage(s: MergeSummary): string {
  const parts = [
    `Merged ${s.merged}`,
    `${plural(s.playlist_slots_moved, 'playlist slot', 'playlist slots')} moved`,
  ]
  if (s.trashed > 0) parts.push(`${plural(s.trashed, 'file', 'files')} in Trash`)
  if (s.trash_failed.length > 0) {
    parts.push(`${s.trash_failed.length} could not be moved to Trash`)
  }
  return parts.join(' · ')
}

export function DuplicatesModal({
  onClose,
  onTracksChanged,
  onNotification,
}: DuplicatesModalProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  const [choice, setChoice] = useState<MergeChoice>(() => initialChoice([]))
  const [moveToTrash, setMoveToTrash] = useState(false)
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)

  // Closing mid-merge would hide the result, so every way out waits for it.
  const closeUnlessMerging = () => {
    if (!merging) onClose()
  }
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(true, closeUnlessMerging)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await tauriApi.getDuplicateGroups()
      setGroups(data)
      setChoice(initialChoice(data))
    } catch (err) {
      onNotification(getErrorMessage(err), 'error')
      setGroups([])
      setChoice(initialChoice([]))
    } finally {
      setLoading(false)
    }
  }, [onNotification])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const filteredGroups = useMemo(
    () =>
      activeFilter === 'all'
        ? groups
        : groups.filter((g) => g.detection_reason === activeFilter),
    [groups, activeFilter],
  )

  const toMerge = mergeCount(choice, groups)
  const visibleAllMerged = allMerged(choice, filteredGroups)

  async function mergeSelected() {
    if (merging) return
    const merges = buildMerges(choice, groups)
    if (merges.length === 0) return
    setMerging(true)
    try {
      const result = await tauriApi.mergeDuplicateTracks(merges, moveToTrash)
      onNotification(
        summaryMessage(result),
        result.trash_failed.length > 0 ? 'warning' : 'success',
      )
      onTracksChanged()
      await loadGroups()
    } catch (err) {
      onNotification(getErrorMessage(err), 'error')
    } finally {
      setMerging(false)
    }
  }

  const totalGroups = groups.length
  const summary = `${plural(totalGroups, 'group', 'groups')} · ${toMerge} ${toMerge === 1 ? 'copy' : 'copies'} will be merged`
  const actionLabel = merging
    ? 'Merging…'
    : moveToTrash
      ? `Merge ${toMerge} & move to Trash`
      : `Merge ${toMerge}`

  return (
    <div className="modal-overlay" onClick={closeUnlessMerging}>
      <div
        className="modal-content dup-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dup-modal__header">
          <div>
            <h3>Duplicate Tracks</h3>
            <p className="dup-modal__summary">{summary}</p>
          </div>
          <button
            type="button"
            className="dup-modal__close"
            onClick={closeUnlessMerging}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </header>

        {/* Sticky filter + merge-all bar */}
        <div className="dup-modal__toolbar">
          <div className="dup-modal__tabs">
            {FILTER_TABS.map((tab) => {
              const count =
                tab.value === 'all'
                  ? groups.length
                  : groups.filter((g) => g.detection_reason === tab.value)
                      .length
              return (
                <button
                  key={tab.value}
                  type="button"
                  className={`dup-tab ${activeFilter === tab.value ? 'dup-tab--active' : ''}`}
                  onClick={() => setActiveFilter(tab.value)}
                >
                  {tab.label}
                  <span className="dup-tab__count">{count}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="dup-toolbar-btn"
            onClick={() =>
              setChoice(setMergeAll(choice, filteredGroups, !visibleAllMerged))
            }
            disabled={loading || merging || filteredGroups.length === 0}
          >
            <Icon
              name={visibleAllMerged ? 'SquareCheckBig' : 'Square'}
              size={14}
            />
            <span>{visibleAllMerged ? 'Merge none' : 'Merge all'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="dup-modal__body">
          {loading ? (
            <div className="dup-modal__state">
              <Icon name="Loader" size={28} />
              <p>Scanning library…</p>
            </div>
          ) : totalGroups === 0 ? (
            <div className="dup-modal__state dup-modal__state--success">
              <Icon name="CircleCheck" size={36} />
              <p>No duplicates found</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="dup-modal__state">
              <Icon name="ListFilter" size={24} />
              <p>No groups match this filter.</p>
            </div>
          ) : (
            <div className="dup-modal__groups">
              {filteredGroups.map((group) => (
                <GroupCard
                  key={groupKey(group)}
                  group={group}
                  choice={choice}
                  disabled={merging}
                  onPickKeep={(id) => setChoice(pickKeep(choice, group, id))}
                  onToggleMerge={(id) =>
                    setChoice(toggleMerge(choice, group, id))
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="dup-modal__footer">
          <div className="dup-trash">
            <label className="dup-trash__label">
              <input
                type="checkbox"
                checked={moveToTrash}
                onChange={(e) => setMoveToTrash(e.target.checked)}
                disabled={merging}
              />
              <span>Also move removed files to Trash</span>
            </label>
            <span className="dup-trash__hint">
              Either way, removed files are skipped on future scans.
            </span>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={merging}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${moveToTrash ? 'btn--danger' : 'btn--primary'} dup-modal__merge`}
            onClick={mergeSelected}
            disabled={merging || toMerge === 0}
          >
            <Icon name={moveToTrash ? 'Trash2' : 'GitMerge'} size={14} />
            <span>{actionLabel}</span>
          </button>
        </footer>
      </div>
    </div>
  )
}

function GroupCard({
  group,
  choice,
  disabled,
  onPickKeep,
  onToggleMerge,
}: {
  group: DuplicateGroup
  choice: MergeChoice
  disabled: boolean
  onPickKeep: (id: number) => void
  onToggleMerge: (id: number) => void
}) {
  const key = groupKey(group)
  const keepId = choice.keep.get(key) ?? group.recommended_keep_id
  return (
    <section className={`dup-card dup-card--${group.detection_reason}`}>
      <header className="dup-card__header">
        <span
          className={`dup-badge dup-badge--${group.detection_reason}`}
        >
          {REASON_LABELS[group.detection_reason]}
        </span>
        <span className="dup-card__count">{group.tracks.length} tracks</span>
      </header>
      <ul className="dup-card__rows">
        {group.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            radioName={`dup-keep-${key}`}
            state={rowState(choice, group, track.id)}
            recommendReason={
              track.id === group.recommended_keep_id
                ? group.recommend_reason
                : null
            }
            slots={slotsMoving(group, keepId, track)}
            disabled={disabled}
            onPickKeep={() => onPickKeep(track.id)}
            onToggleMerge={() => onToggleMerge(track.id)}
          />
        ))}
      </ul>
    </section>
  )
}

function TrackRow({
  track,
  radioName,
  state,
  recommendReason,
  slots,
  disabled,
  onPickKeep,
  onToggleMerge,
}: {
  track: DuplicateTrack
  radioName: string
  state: RowState
  recommendReason: string | null
  slots: number
  disabled: boolean
  onPickKeep: () => void
  onToggleMerge: () => void
}) {
  return (
    <li className={`dup-row dup-row--${state}`}>
      <div className="dup-row__controls">
        <label className="dup-row__control">
          <input
            type="radio"
            name={radioName}
            checked={state === 'keep'}
            onChange={onPickKeep}
            disabled={disabled}
          />
          <span>Keep</span>
        </label>
        <label
          className={`dup-row__control ${state === 'keep' ? 'dup-row__control--off' : ''}`}
        >
          <input
            type="checkbox"
            checked={state === 'merge'}
            onChange={onToggleMerge}
            disabled={disabled || state === 'keep'}
          />
          <span>Merge</span>
        </label>
      </div>
      <div className="dup-row__info">
        <div className="dup-row__line1">
          <span className="dup-row__title">
            {track.title || <span className="dup-muted">Untitled</span>}
          </span>
          <span className="dup-row__artist">
            {track.artist ? (
              <>by {track.artist}</>
            ) : (
              <span className="dup-muted">Unknown artist</span>
            )}
          </span>
          {recommendReason && (
            <span className="dup-keep-badge">
              <b>Recommended</b> {recommendReason}
            </span>
          )}
        </div>
        <div className="dup-row__path" data-tip={track.file_path} data-tip-overflow>
          {track.file_path}
        </div>
        <div className="dup-row__meta">
          <span>{formatAudio(track)}</span>
          <span className="dup-row__sep">·</span>
          <span>{formatTime(track.duration_ms)}</span>
          <span className="dup-row__sep">·</span>
          <span>{formatMB(track.file_size)}</span>
          <span className="dup-row__sep">·</span>
          <span>{track.analyzed ? 'analyzed' : 'not analyzed'}</span>
          <span className="dup-row__sep">·</span>
          <span>{plural(track.plays, 'play', 'plays')}</span>
          <span className="dup-row__sep">·</span>
          <span>added {formatDate(track.date_added)}</span>
        </div>
        <div className="dup-row__playlists">
          <span className="dup-row__playlists-label">Playlists:</span>
          {track.playlists.length === 0 ? (
            <span className="dup-muted">not in any playlist</span>
          ) : (
            track.playlists.map((p) => (
              <span key={p.id} className="dup-chip">
                {p.name}
              </span>
            ))
          )}
        </div>
        <div className={`dup-row__status dup-row__status--${state}`}>
          {statusText(state, slots)}
        </div>
      </div>
    </li>
  )
}
