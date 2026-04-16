export function LibraryStatsWidget({ totalTracks, playlistCount, folderCount }: {
  totalTracks: number
  playlistCount: number
  folderCount: number
}) {
  return (
    <div className="widget-stats">
      <div className="widget-stats__item">
        <span className="widget-stats__value">{totalTracks.toLocaleString()}</span>
        <span className="widget-stats__label">Tracks</span>
      </div>
      <div className="widget-stats__item">
        <span className="widget-stats__value">{playlistCount}</span>
        <span className="widget-stats__label">Playlists</span>
      </div>
      <div className="widget-stats__item">
        <span className="widget-stats__value">{folderCount}</span>
        <span className="widget-stats__label">Folders</span>
      </div>
    </div>
  )
}
