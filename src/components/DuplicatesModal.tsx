// Large modal opened from Settings → Database Maintenance. Shows every
// duplicate group the backend detected across three passes. In each group
// the user keeps one copy and merges the others into it (Duplicates Merge
// spec): merged copies hand over their playlists, tags, plays and analysis,
// and their files are skipped on future scans.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { getErrorMessage } from '../types/ai'
import { copyFacts, copyPlace } from '../lib/duplicates/copyFacts'
import {
  allMerged,
  buildMerges,
  groupKey,
  initialChoice,
  mergeCount,
  pickKeep,
  rowState,
  setLeft,
  setMergeAll,
  slotsMoving,
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

const FILTER_TABS: { value: FilterValue; label: string; tip?: string }[] = [
  { value: 'all', label: 'All' },
  {
    value: 'identical_content',
    label: 'Identical',
    tip: 'The same file, byte for byte.',
  },
  {
    value: 'identical_filename_size',
    label: 'Same file',
    tip: 'Same file name and size, in different folders.',
  },
  {
    value: 'same_title_artist',
    label: 'Title & artist',
    tip: 'Same title and artist. Can be another version or mix, so check before merging.',
  },
]

const STATES: { state: RowState; label: string; tip: string }[] = [
  {
    state: 'keep',
    label: 'Keep',
    tip: 'This copy stays. The merged copies hand it their playlists, plays, tags and analysis.',
  },
  {
    state: 'merge',
    label: 'Merge',
    tip: 'Merge into the kept copy: its playlists, plays, tags and analysis move over, then it leaves the library.',
  },
  {
    state: 'left',
    label: 'Leave',
    tip: 'Not a duplicate. This copy stays a separate track.',
  },
]

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return iso.split(' ')[0] ?? iso.split('T')[0] ?? iso
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function summaryMessage(s: MergeSummary): string {
  const parts = [
    `Merged ${s.merged}`,
    `${plural(s.playlist_slots_moved, 'playlist slot', 'playlist slots')} moved`,
  ]
  if (s.trashed > 0)
    parts.push(`${plural(s.trashed, 'file', 'files')} in Trash`)
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

  // The parent passes a new onNotification every render (about 4 times a
  // second while music plays). Held in a ref, it can't retrigger the load
  // and wipe the user's choices.
  const notifyRef = useRef(onNotification)
  useEffect(() => {
    notifyRef.current = onNotification
  })

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await tauriApi.getDuplicateGroups()
      setGroups(data)
      setChoice(initialChoice(data))
    } catch (err) {
      notifyRef.current(getErrorMessage(err), 'error')
      setGroups([])
      setChoice(initialChoice([]))
    } finally {
      setLoading(false)
    }
  }, [])

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

  // Only the groups on the active tab merge: what you see is what merges.
  const toMerge = mergeCount(choice, filteredGroups)
  const visibleAllMerged = allMerged(choice, filteredGroups)

  async function mergeSelected() {
    if (merging) return
    const merges = buildMerges(choice, filteredGroups)
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
  const groupsLabel =
    filteredGroups.length === totalGroups
      ? plural(totalGroups, 'group', 'groups')
      : `${filteredGroups.length} of ${plural(totalGroups, 'group', 'groups')}`
  const summary = `${groupsLabel} · ${toMerge === 1 ? '1 copy' : `${toMerge} copies`} will merge into the kept copy`
  const actionLabel = merging
    ? 'Merging…'
    : moveToTrash
      ? `Merge ${toMerge} & move to Trash`
      : `Merge ${toMerge === 1 ? '1 copy' : `${toMerge} copies`}`

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

        <div className="dup-modal__toolbar">
          <div className="dup-tabs" role="tablist">
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
                  role="tab"
                  aria-selected={activeFilter === tab.value}
                  className={`dup-tab ${activeFilter === tab.value ? 'dup-tab--active' : ''}`}
                  onClick={() => setActiveFilter(tab.value)}
                  data-tip={tab.tip}
                >
                  {tab.label}
                  <span className="dup-tab__count">{count}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="dup-text-btn"
            onClick={() =>
              setChoice(setMergeAll(choice, filteredGroups, !visibleAllMerged))
            }
            disabled={loading || merging || filteredGroups.length === 0}
          >
            {visibleAllMerged ? 'Leave all' : 'Merge all'}
          </button>
        </div>

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
                  onPick={(id, state) =>
                    setChoice(
                      state === 'keep'
                        ? pickKeep(choice, group, id)
                        : setLeft(choice, group, id, state === 'left'),
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

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
              Merged copies are skipped on future scans either way.
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
  onPick,
}: {
  group: DuplicateGroup
  choice: MergeChoice
  disabled: boolean
  onPick: (id: number, state: RowState) => void
}) {
  const keepId = choice.keep.get(groupKey(group)) ?? group.recommended_keep_id
  const facts = copyFacts(group)
  return (
    <section className="dup-card">
      <header className="dup-card__header">
        <div className="dup-card__top">
          <span className="dup-card__title">{facts.heading}</span>
          <span className="dup-card__aside">
            <span
              className={`dup-reason dup-reason--${group.detection_reason}`}
            >
              {REASON_LABELS[group.detection_reason]}
            </span>
            <span>{plural(group.tracks.length, 'copy', 'copies')}</span>
          </span>
        </div>
        {facts.shared.length > 0 && (
          <div className="dup-card__shared">
            Same for all: {facts.shared.join(' · ')}
          </div>
        )}
      </header>
      <ul className="dup-card__rows">
        {group.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            state={rowState(choice, group, track.id)}
            differ={facts.differ.get(track.id) ?? []}
            recommendReason={
              track.id === group.recommended_keep_id
                ? group.recommend_reason
                : null
            }
            slots={slotsMoving(group, keepId, track)}
            disabled={disabled}
            onPick={(state) => onPick(track.id, state)}
          />
        ))}
      </ul>
    </section>
  )
}

function TrackRow({
  track,
  state,
  differ,
  recommendReason,
  slots,
  disabled,
  onPick,
}: {
  track: DuplicateTrack
  state: RowState
  differ: string[]
  recommendReason: string | null
  slots: number
  disabled: boolean
  onPick: (state: RowState) => void
}) {
  const place = copyPlace(track.file_path)
  const inPlaylists =
    track.playlists.length === 0
      ? 'no playlists'
      : `in ${track.playlists.map((p) => p.name).join(', ')}`
  const moves = state === 'merge' && slots > 0
  return (
    <li className={`dup-row dup-row--${state}`}>
      <div className="dup-row__main">
        <div className="dup-row__place">
          <span
            className="dup-row__path"
            data-tip={`${track.file_path} · added ${formatDate(track.date_added)}`}
          >
            {place.folder && (
              <span className="dup-row__folder">{place.folder} / </span>
            )}
            {place.file}
          </span>
          {recommendReason && (
            <span className="dup-rec">Recommended · {recommendReason}</span>
          )}
        </div>
        <div className="dup-row__facts">
          {track.file_missing && (
            <span className="dup-fact dup-fact--missing">file missing</span>
          )}
          {differ.map((fact, i) => (
            <span key={i} className="dup-fact dup-fact--differs">
              {fact}
            </span>
          ))}
          <span className="dup-fact">
            {track.plays > 0
              ? plural(track.plays, 'play', 'plays')
              : 'no plays'}
          </span>
          <span className={`dup-fact ${moves ? 'dup-fact--moves' : ''}`}>
            {moves ? `${inPlaylists} → moves to the kept copy` : inPlaylists}
          </span>
        </div>
      </div>
      <div
        className="dup-seg"
        role="group"
        aria-label="What happens to this copy"
      >
        {STATES.map((s) => (
          <button
            key={s.state}
            type="button"
            className={`dup-seg__btn ${state === s.state ? `dup-seg__btn--${s.state}` : ''}`}
            aria-pressed={state === s.state}
            onClick={() => onPick(s.state)}
            disabled={disabled || (state === 'keep' && s.state !== 'keep')}
            data-tip={s.tip}
          >
            {s.label}
          </button>
        ))}
      </div>
    </li>
  )
}
