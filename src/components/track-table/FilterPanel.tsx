// src/components/track-table/FilterPanel.tsx
// The Filter button's panel (track table spec). Each field applies at once;
// Show N closes the panel, Clear all clears every field.
import { useMemo } from 'react'
import type { Track } from '../../types/track'
import { SelectMenu, type SelectOption } from '../SelectMenu'
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

const ANY: SelectOption = { value: '', label: 'Any' }

const RATINGS: SelectOption[] = [
  ANY,
  ...[1, 2, 3, 4, 5].map((rating) => ({
    value: String(rating),
    label: ratingLabel(rating),
  })),
]

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
  const genres = useMemo(
    () => [
      ANY,
      ...facets.genres.map((genre) => ({
        value: genre.value,
        label: genre.value,
        hint: genre.count.toLocaleString('en-US'),
      })),
    ],
    [facets],
  )
  const keys = useMemo(
    () => [
      ANY,
      ...facets.keys.map((key) => ({
        value: key.value,
        label: key.value,
        hint: key.count.toLocaleString('en-US'),
      })),
    ],
    [facets],
  )
  const set = <K extends keyof TrackFilter>(
    field: K,
    value: TrackFilter[K] | undefined,
  ) => onChange(withFilterField(filter, field, value))

  return (
    <>
      <h5 className="popover__title">Filter</h5>

      <div className="tt-filter-field">
        <label htmlFor="tt-filter-genre">Genre</label>
        <SelectMenu
          id="tt-filter-genre"
          label="Genre"
          value={filter?.genre ?? ''}
          options={genres}
          onChange={(value) => set('genre', value || undefined)}
          searchable
        />
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
        <SelectMenu
          id="tt-filter-key"
          label="Key"
          value={filter?.key ?? ''}
          options={keys}
          onChange={(value) => set('key', value || undefined)}
        />
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
        <SelectMenu
          id="tt-filter-rating"
          label="Rating"
          value={filter?.minRating !== undefined ? String(filter.minRating) : ''}
          options={RATINGS}
          onChange={(value) => set('minRating', value ? Number(value) : undefined)}
        />
      </div>

      <div className="popover__footer">
        <button type="button" className="link-btn" onClick={() => onChange(null)}>
          Clear all
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
          Show {shownCount.toLocaleString('en-US')}
        </button>
      </div>
    </>
  )
}
