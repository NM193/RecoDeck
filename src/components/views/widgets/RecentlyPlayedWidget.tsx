import { useEffect, useState } from 'react'
import { tauriApi } from '../../../lib/tauri-api'
import { Icon } from '../../Icon'

interface PlayEntry {
  track_id: number
  playlist_id: number | null
  played_at: number
  title: string | null
  artist: string | null
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function RecentlyPlayedWidget() {
  const [entries, setEntries] = useState<PlayEntry[]>([])

  useEffect(() => {
    tauriApi.getRecentlyPlayed(6).then(setEntries).catch(console.error)
  }, [])

  if (entries.length === 0) {
    return (
      <div className="widget-empty">
        <Icon name="Clock" size={20} />
        <span>No play history yet</span>
      </div>
    )
  }

  return (
    <div className="widget-list">
      {entries.map((entry, i) => (
        <div key={`${entry.track_id}-${i}`} className="widget-list__item">
          <div className="widget-list__item-icon">
            <Icon name="Music" size={14} />
          </div>
          <div className="widget-list__item-info">
            <span className="widget-list__item-title">{entry.title ?? 'Unknown Track'}</span>
            <span className="widget-list__item-meta">{entry.artist ?? 'Unknown'} · {timeAgo(entry.played_at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
