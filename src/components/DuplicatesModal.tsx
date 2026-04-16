// Large modal opened from Settings → Database Maintenance. Shows every
// duplicate group the backend detected across three passes, lets the user
// pick which tracks to remove, and bulk-deletes the selection.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { tauriApi } from '../lib/tauri-api'
import type { DuplicateGroup, DuplicateReason, Track } from '../types/track'
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

function formatMB(bytes?: number): string {
  if (bytes == null) return '—'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return iso.split(' ')[0] ?? iso.split('T')[0] ?? iso
}

export function DuplicatesModal({
  onClose,
  onTracksChanged,
  onNotification,
}: DuplicatesModalProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await tauriApi.getDuplicateGroups()
      setGroups(data)
      // Pre-select every non-first track (the recommended deletions).
      const initial = new Set<number>()
      for (const g of data) {
        for (let i = 1; i < g.tracks.length; i++) {
          const t = g.tracks[i]
          if (typeof t.id === 'number') initial.add(t.id)
        }
      }
      setSelectedIds(initial)
    } catch (err) {
      onNotification(
        err instanceof Error ? err.message : String(err),
        'error',
      )
      setGroups([])
      setSelectedIds(new Set())
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

  const visibleSelectableIds = useMemo(() => {
    const ids: number[] = []
    for (const g of filteredGroups) {
      for (const t of g.tracks) {
        if (typeof t.id === 'number') ids.push(t.id)
      }
    }
    return ids
  }, [filteredGroups])

  const allVisibleSelected =
    visibleSelectableIds.length > 0 &&
    visibleSelectableIds.every((id) => selectedIds.has(id))

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const id of visibleSelectableIds) next.delete(id)
      } else {
        for (const id of visibleSelectableIds) next.add(id)
      }
      return next
    })
  }

  async function deleteSelected() {
    if (selectedIds.size === 0 || deleting) return
    setDeleting(true)
    try {
      const removed = await tauriApi.deleteTracksBulk(Array.from(selectedIds))
      onNotification(
        `Removed ${removed} duplicate track${removed === 1 ? '' : 's'}`,
        'success',
      )
      onTracksChanged()
      setSelectedIds(new Set())
      await loadGroups()
    } catch (err) {
      onNotification(
        err instanceof Error ? err.message : String(err),
        'error',
      )
    } finally {
      setDeleting(false)
    }
  }

  const totalGroups = groups.length
  const summary = `${totalGroups} group${totalGroups === 1 ? '' : 's'} · ${selectedIds.size} track${selectedIds.size === 1 ? '' : 's'} selected for removal`

  return (
    <div className="modal-overlay" onClick={onClose}>
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
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </header>

        {/* Sticky filter + select-all bar */}
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
            onClick={toggleAllVisible}
            disabled={
              loading || deleting || visibleSelectableIds.length === 0
            }
          >
            <Icon
              name={allVisibleSelected ? 'SquareCheckBig' : 'Square'}
              size={14}
            />
            <span>{allVisibleSelected ? 'Deselect all' : 'Select all'}</span>
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
              {filteredGroups.map((group, gi) => (
                <GroupCard
                  key={`${group.detection_reason}-${gi}-${group.tracks[0]?.id ?? gi}`}
                  group={group}
                  selectedIds={selectedIds}
                  onToggleOne={toggleOne}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="dup-modal__footer">
          <button
            type="button"
            className="modal-button modal-button-secondary"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-button modal-button-primary dup-modal__delete"
            onClick={deleteSelected}
            disabled={deleting || selectedIds.size === 0}
          >
            <Icon name="Trash2" size={14} />
            <span>
              {deleting
                ? 'Removing…'
                : `Delete selected (${selectedIds.size})`}
            </span>
          </button>
        </footer>
      </div>
    </div>
  )
}

function GroupCard({
  group,
  selectedIds,
  onToggleOne,
}: {
  group: DuplicateGroup
  selectedIds: Set<number>
  onToggleOne: (id: number) => void
}) {
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
        {group.tracks.map((track, i) => (
          <TrackRow
            key={track.id ?? `${track.file_path}-${i}`}
            track={track}
            recommendedKeep={i === 0}
            checked={
              typeof track.id === 'number' && selectedIds.has(track.id)
            }
            onToggle={() => {
              if (typeof track.id === 'number') onToggleOne(track.id)
            }}
          />
        ))}
      </ul>
    </section>
  )
}

function TrackRow({
  track,
  recommendedKeep,
  checked,
  onToggle,
}: {
  track: Track
  recommendedKeep: boolean
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li
      className={`dup-row ${recommendedKeep ? 'dup-row--keep' : ''} ${checked ? 'dup-row--selected' : ''}`}
    >
      <label className="dup-row__check">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={typeof track.id !== 'number'}
        />
      </label>
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
          {recommendedKeep && (
            <span className="dup-keep-badge">Recommended keep</span>
          )}
        </div>
        <div className="dup-row__path" title={track.file_path}>
          {track.file_path}
        </div>
        <div className="dup-row__meta">
          <span>{formatMB(track.file_size)}</span>
          <span className="dup-row__sep">·</span>
          <span>added {formatDate(track.date_added)}</span>
        </div>
      </div>
    </li>
  )
}
