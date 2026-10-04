// src/components/track-table/FilterPanel.tsx
// The Filter button's panel (track table spec). Each field applies at once;
// Show N closes the panel, Clear all clears every field.
import { useMemo } from 'react'
import type { Track } from '../../types/track'
import {
  parseBpmInput,
  ratingLabel,
  trackFacets,
  withFilterField,
  type TrackFilter,
} from '../../lib/trackTable/filter'

interface FilterPanelProps {
  /** The view's tracks before the filter: the genre and key lists count them. */
  tracks: Track[]
  filter: TrackFilter | null
  onChange: (filter: TrackFilter | null) => void
  /** The rows the table shows with this filter. */
  shownCount: number
  onClose: () => void
}

interface SegmentOption<T> {
  value: T | undefined
  label: string
}

const ADDED: SegmentOption<7 | 30>[] = [
  { value: undefined, label: 'Any' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
]

const PLAYED: SegmentOption<'never' | 'played'>[] = [
  { value: undefined, label: 'Any' },
  { value: 'never', label: 'Never' },
  { value: 'played', label: 'Played' },
]

const RATINGS = [1, 2, 3, 4, 5]

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T | undefined
  onChange: (value: T | undefined) => void
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          className="segmented__item"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function FilterPanel({
  tracks,
  filter,
  onChange,
  shownCount,
  onClose,
}: FilterPanelProps) {
  const facets = useMemo(() => trackFacets(tracks, filter), [tracks, filter])
  const set = <K extends keyof TrackFilter>(
    field: K,
    value: TrackFilter[K] | undefined,
  ) => onChange(withFilterField(filter, field, value))

  return (
    <>
      <h5 className="popover__title">Filter</h5>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-genre">Genre</label>
        <select
          id="tt-filter-genre"
          className="tt-filter-input"
          value={filter?.genre ?? ''}
          onChange={(e) => set('genre', e.target.value || undefined)}
        >
          <option value="">Any</option>
          {facets.genres.map((genre) => (
            <option key={genre.value} value={genre.value}>
              {genre.value} ({genre.count.toLocaleString('en-US')})
            </option>
          ))}
        </select>
      </div>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-bpm-from">BPM</label>
        <div className="tt-filter-range">
          <input
            id="tt-filter-bpm-from"
            className="tt-filter-input"
            type="number"
            min={0}
            step={1}
            placeholder="from"
            value={filter?.bpmMin ?? ''}
            onChange={(e) => set('bpmMin', parseBpmInput(e.target.value))}
          />
          –
          <input
            aria-label="BPM to"
            className="tt-filter-input"
            type="number"
            min={0}
            step={1}
            placeholder="to"
            value={filter?.bpmMax !== undefined ? filter.bpmMax - 1 : ''}
            onChange={(e) => {
              const to = parseBpmInput(e.target.value)
              set('bpmMax', to === undefined ? undefined : to + 1)
            }}
          />
        </div>
      </div>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-key">Key</label>
        <select
          id="tt-filter-key"
          className="tt-filter-input"
          value={filter?.key ?? ''}
          onChange={(e) => set('key', e.target.value || undefined)}
        >
          <option value="">Any</option>
          {facets.keys.map((key) => (
            <option key={key.value} value={key.value}>
              {key.value}
            </option>
          ))}
        </select>
      </div>

      <div className="tt-filter-field">
        <span>Added</span>
        <Segmented
          label="Added"
          options={ADDED}
          value={filter?.added}
          onChange={(value) => set('added', value)}
        />
      </div>

      <div className="tt-filter-field">
        <span>Played</span>
        <Segmented
          label="Played"
          options={PLAYED}
          value={filter?.played}
          onChange={(value) => set('played', value)}
        />
      </div>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-rating">Rating</label>
        <select
          id="tt-filter-rating"
          className="tt-filter-input"
          value={filter?.minRating ?? ''}
          onChange={(e) =>
            set('minRating', e.target.value ? Number(e.target.value) : undefined)
          }
        >
          <option value="">Any</option>
          {RATINGS.map((rating) => (
            <option key={rating} value={rating}>
              {ratingLabel(rating)}
            </option>
          ))}
        </select>
      </div>

      <div className="tt-filter-footer">
        <button type="button" className="tt-filter-link" onClick={() => onChange(null)}>
          Clear all
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
          Show {shownCount.toLocaleString('en-US')}
        </button>
      </div>
    </>
  )
}
