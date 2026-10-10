// src/components/views/YouTubeMusicView.tsx
// One YouTube Music list — or All playlists — against the library. The view is
// StreamingListView; this gives it YouTube Music's rows, words and actions,
// and the Sets group under the table.
import { useId, useMemo, useState } from 'react'
import { StreamingListView, type RowText } from './StreamingListView'
import { Icon } from '../Icon'
import { YouTubeMusicRowActions } from '../youtube-music/YouTubeMusicRowActions'
import type { SpotifyData } from '../spotify/useSpotify'
import type {
  YouTubeMusicData,
  YouTubeMusicMatches,
} from '../youtube-music/useYouTubeMusic'
import type { Track } from '../../types/track'
import { formatSynced } from '../../lib/spotify/rows'
import { msToCue } from '../../lib/tracklist/text'
import {
  rowsFor,
  syncErrorText,
  unavailableCount,
  type YtmRow,
  type YtmSetRow,
} from '../../lib/youtube-music/rows'
import { ALL_YTM_LISTS, LIKED_MUSIC } from '../../types/youtubeMusic'
import { HoverGlide } from '../HoverGlide'
import './YouTubeMusicView.css'

interface YouTubeMusicViewProps {
  /** ALL_YTM_LISTS, LIKED_MUSIC, or a playlist id. */
  listId: string
  youtubeMusic: YouTubeMusicData
  matches: YouTubeMusicMatches
  /** useSpotify's library: the files to play, and whether they have arrived. */
  library: Pick<SpotifyData, 'libraryTracks' | 'libraryLoaded'>
  /** App's player: plays a library file with a queue. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
  /** Opens Sets on a video; Sets fetches it when it is not stored. */
  onOpenSet: (videoId: string) => void
}

function describeRow(row: YtmRow): RowText {
  return {
    key: row.track.videoId,
    title: row.title,
    titleTip: row.track.title,
    artist: row.artist,
    search: `${row.title} ${row.artist} ${row.track.title} ${row.track.channel}`,
  }
}

/** The meta line's last part: "synced 2 min ago", or why not. */
function syncLine(youtubeMusic: YouTubeMusicData, now: number | null): string {
  if (youtubeMusic.syncing) return 'syncing…'
  const status = youtubeMusic.status
  // The spec's exact words, whatever else happened.
  if (status?.quotaUsedUp) return syncErrorText('quotaExceeded')
  const ago =
    status?.lastSyncedAt && now !== null
      ? formatSynced(status.lastSyncedAt, now)
      : null
  if (status?.needsReconnect) return ago ? `last synced ${ago}` : 'not synced'
  // After Pacific midnight quotaUsedUp is false but the kind lingers until the
  // next sync: that is no longer "paused for today".
  if (status?.lastError && status.lastErrorKind !== 'quotaExceeded') {
    const why = syncErrorText(status.lastErrorKind)
    return ago ? `last synced ${ago} · ${why}` : why
  }
  if (!status?.lastSyncedAt) return 'not synced yet'
  return ago ? `synced ${ago}` : 'synced'
}

/**
 * The sets in the list: not tracks, each one click from Sets. Closed until
 * asked for, so the tracks keep the room.
 */
function SetsGroup({
  sets,
  onOpenSet,
}: {
  sets: YtmSetRow[]
  onOpenSet: (videoId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rowsId = useId()
  return (
    <section className={`ytm-sets${open ? ' ytm-sets--open' : ''}`}>
      <h2 className="ytm-sets__title">
        <button
          type="button"
          className="ytm-sets__toggle"
          aria-expanded={open}
          aria-controls={rowsId}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon
            name="ChevronRight"
            size={12}
            strokeWidth={2}
            className="ytm-sets__chevron"
          />
          Sets ({sets.length})
        </button>
      </h2>
      <HoverGlide
        id={rowsId}
        hidden={!open}
        className="ytm-sets__rows"
        item=".ytm-sets__row"
        kind="row"
      >
        {sets.map(({ track }) => (
          <div className="ytm-sets__row" key={track.videoId}>
            <span className="ytm-sets__name" title={track.title}>
              {track.title}
            </span>
            <span className="ytm-sets__channel" title={track.channel}>
              {track.channel}
            </span>
            <span className="ytm-sets__length">
              {msToCue(track.durationMs ?? 0)}
            </span>
            <button
              type="button"
              className="spotify-mini"
              aria-label={`Open ${track.title} in Sets`}
              onClick={() => onOpenSet(track.videoId)}
            >
              Open in Sets
            </button>
          </div>
        ))}
      </HoverGlide>
    </section>
  )
}

export function YouTubeMusicView({
  listId,
  youtubeMusic,
  matches,
  library,
  onPlayTrack,
  onOpenSet,
}: YouTubeMusicViewProps) {
  const list = youtubeMusic.library.lists.find((l) => l.id === listId)
  const { rows, sets } = useMemo(
    () =>
      rowsFor(
        listId,
        youtubeMusic.library,
        matches.ownership,
        youtubeMusic.seenBefore,
      ),
    [listId, youtubeMusic.library, matches.ownership, youtubeMusic.seenBefore],
  )
  const unavailable = useMemo(
    () => unavailableCount(listId, youtubeMusic.library),
    [listId, youtubeMusic.library],
  )
  const checking = !library.libraryLoaded

  return (
    <StreamingListView
      serviceName="YouTube Music"
      service="youtube-music"
      kicker="YouTube Music playlist"
      title={
        listId === ALL_YTM_LISTS
          ? 'All playlists'
          : (list?.name ?? 'YouTube Music playlist')
      }
      coverIcon={listId === LIKED_MUSIC ? 'Heart' : 'ListMusic'}
      rows={rows}
      describe={describeRow}
      renderStatus={(row) => (
        <YouTubeMusicRowActions
          row={row}
          checking={checking}
          onVerdict={(verdict) =>
            row.ownership.file
              ? youtubeMusic.setVerdict(
                  row.track.videoId,
                  row.ownership.file.id,
                  verdict,
                )
              : Promise.resolve()
          }
        />
      )}
      showLists={listId === ALL_YTM_LISTS}
      missingText={
        listId !== ALL_YTM_LISTS && !list
          ? 'This playlist is no longer in the sidebar.'
          : rows.length === 0 && sets.length > 0
            ? 'No tracks — only DJ sets, listed below.'
            : null
      }
      filter={youtubeMusic.filter}
      onFilter={youtubeMusic.setFilter}
      checking={checking}
      libraryTracks={library.libraryTracks}
      onPlayTrack={onPlayTrack}
      syncing={youtubeMusic.syncing}
      syncText={(now) => syncLine(youtubeMusic, now)}
      onSync={youtubeMusic.syncNow}
      needsReconnect={youtubeMusic.status?.needsReconnect ?? false}
      onReconnect={youtubeMusic.reconnect}
      loginCancelledKind="YouTubeMusicLoginCancelled"
      notice={list?.unavailableAt ? 'no longer available' : undefined}
      footerNote={unavailable > 0 ? `${unavailable} unavailable` : undefined}
      afterTable={
        sets.length > 0 ? (
          <SetsGroup sets={sets} onOpenSet={onOpenSet} />
        ) : undefined
      }
    />
  )
}
