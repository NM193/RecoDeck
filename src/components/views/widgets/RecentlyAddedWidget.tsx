import { useEffect, useState } from 'react'
import { tauriApi } from '../../../lib/tauri-api'
import { Icon } from '../../Icon'

interface RecentTrack {
  id: number
  title: string | null
  artist: string | null
}

export function RecentlyAddedWidget() {
  const [tracks, setTracks] = useState<RecentTrack[]>([])

  useEffect(() => {
    tauriApi.getRecentlyAdded(8).then(setTracks).catch(console.error)
  }, [])

  if (tracks.length === 0) {
    return (
      <div className="widget-empty">
        <Icon name="Plus" size={20} />
        <span>No tracks imported yet</span>
      </div>
    )
  }

  return (
    <div className="widget-list">
      {tracks.map((track) => (
        <div key={track.id} className="widget-list__item">
          <div className="widget-list__item-icon">
            <Icon name="Music" size={14} />
          </div>
          <div className="widget-list__item-info">
            <span className="widget-list__item-title">{track.title ?? 'Unknown Track'}</span>
            <span className="widget-list__item-meta">{track.artist ?? 'Unknown Artist'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
