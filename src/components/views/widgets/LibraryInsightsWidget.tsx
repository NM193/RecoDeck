import { useEffect, useState } from 'react'
import { tauriApi } from '../../../lib/tauri-api'

interface Insights {
  top_genre: string | null
  bpm_min: number | null
  bpm_max: number | null
  top_key: string | null
  avg_energy: number | null
}

export function LibraryInsightsWidget() {
  const [insights, setInsights] = useState<Insights | null>(null)

  useEffect(() => {
    tauriApi.getLibraryInsights().then(setInsights).catch(console.error)
  }, [])

  if (!insights) {
    return <div className="widget-empty"><span>Loading insights...</span></div>
  }

  const bpmRange = insights.bpm_min && insights.bpm_max
    ? `${Math.round(insights.bpm_min)}–${Math.round(insights.bpm_max)}`
    : '—'

  return (
    <div className="widget-insights">
      <div className="widget-insights__item">
        <span className="widget-insights__label">Top Genre</span>
        <span className="widget-insights__value">{insights.top_genre ?? '—'}</span>
      </div>
      <div className="widget-insights__item">
        <span className="widget-insights__label">BPM Range</span>
        <span className="widget-insights__value">{bpmRange}</span>
      </div>
      <div className="widget-insights__item">
        <span className="widget-insights__label">Top Key</span>
        <span className="widget-insights__value">{insights.top_key ?? '—'}</span>
      </div>
      <div className="widget-insights__item">
        <span className="widget-insights__label">Avg Energy</span>
        <span className="widget-insights__value">
          {insights.avg_energy != null ? insights.avg_energy.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  )
}
