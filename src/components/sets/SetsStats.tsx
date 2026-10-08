// src/components/sets/SetsStats.tsx
// Stats (Sets redesign spec, Stats): four cards in Home's quiet style — Most
// played, Doing the rounds, Most gaps (a row opens the set), Quota — under
// the summary line.
import type { YouTubeQuotaStatus, YtStats } from '../../types/youtube'
import './SetsTabs.css'

interface SetsStatsProps {
  stats: YtStats | null
  /** The quota as Sets knows it now (the stats' copy is from when the tab opened). */
  quota: YouTubeQuotaStatus | null
  onOpenSet: (videoId: string, title: string) => void
}

const n = (value: number) => value.toLocaleString('en-US')

export function SetsStats({ stats, quota: live, onOpenSet }: SetsStatsProps) {
  if (!stats) return <p className="follow-note">Nothing processed yet.</p>
  const quota = live ?? stats.quota
  const reset = quota.seconds_until_reset
  return (
    <>
      <p className="stats-summary">
        {n(stats.sets)} {stats.sets === 1 ? 'set' : 'sets'} · {n(stats.tracks)} named tracks · {n(stats.unknowns)} still
        unidentified
      </p>
      <div className="stats-cards">
        <section className="stats-card">
          <h3 className="stats-card__title">Most played</h3>
          {stats.top_artists.length === 0 && <p className="follow-note">—</p>}
          {stats.top_artists.map(([artist, count]) => (
            <div className="stats-row" key={artist}>
              <span className="stats-row__name">{artist}</span>
              <span className="stats-row__count">{n(count)}</span>
            </div>
          ))}
        </section>
        <section className="stats-card">
          <h3 className="stats-card__title">Doing the rounds</h3>
          <p className="stats-card__hint">Records that turn up in more than one set.</p>
          {stats.shared_tracks.length === 0 && <p className="follow-note">—</p>}
          {stats.shared_tracks.map(([title, artist, count]) => (
            <div className="stats-row" key={`${artist}-${title}`}>
              <span className="stats-row__name">{artist ? `${artist} — ${title}` : title}</span>
              <span className="stats-row__count">{n(count)} sets</span>
            </div>
          ))}
        </section>
        <section className="stats-card">
          <h3 className="stats-card__title">Most gaps</h3>
          <p className="stats-card__hint">Where digging through the comments would pay off most.</p>
          {stats.most_unknowns.length === 0 && <p className="follow-note">—</p>}
          {stats.most_unknowns.map(([videoId, title, count]) => (
            <button type="button" className="stats-row stats-row--button" key={videoId} onClick={() => onOpenSet(videoId, title)}>
              <span className="stats-row__name">{title}</span>
              <span className="stats-row__count">{n(count)} IDs</span>
            </button>
          ))}
        </section>
        <section className="stats-card">
          <h3 className="stats-card__title">Quota</h3>
          <div className="stats-quota">
            <span>
              <b>{n(quota.spent)}</b> spent today
            </span>
            <span>
              <b>{n(quota.remaining)}</b> left of {n(quota.daily_limit)}
            </span>
            <span>
              resets in {Math.floor(reset / 3600)}h {Math.floor((reset % 3600) / 60)}m
            </span>
          </div>
        </section>
      </div>
    </>
  )
}
