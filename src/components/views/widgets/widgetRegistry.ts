import type { LayoutItem } from 'react-grid-layout/legacy'

export interface WidgetDefinition {
  id: string
  name: string
  description: string
  icon: string
  minW: number
  minH: number
  maxW: number
  maxH: number
  defaultW: number
  defaultH: number
}

export const WIDGET_CATALOG: WidgetDefinition[] = [
  {
    id: 'recently-played',
    name: 'Recently Played',
    description: 'Last played tracks and playlists',
    icon: 'Clock',
    minW: 2, minH: 1, maxW: 4, maxH: 2,
    defaultW: 2, defaultH: 1,
  },
  {
    id: 'quick-actions',
    name: 'Quick Actions',
    description: 'Shortcuts to features',
    icon: 'Zap',
    minW: 2, minH: 1, maxW: 4, maxH: 1,
    defaultW: 2, defaultH: 1,
  },
  {
    id: 'library-stats',
    name: 'Library Stats',
    description: 'Track, playlist, and folder counts',
    icon: 'BarChart3',
    minW: 1, minH: 1, maxW: 4, maxH: 1,
    defaultW: 2, defaultH: 1,
  },
  {
    id: 'ai-recommendations',
    name: 'AI Recommendations',
    description: 'AI-suggested playlists and tracks',
    icon: 'Sparkles',
    minW: 2, minH: 1, maxW: 4, maxH: 2,
    defaultW: 2, defaultH: 1,
  },
  {
    id: 'recently-added',
    name: 'Recently Added',
    description: 'Newest tracks in your library',
    icon: 'Plus',
    minW: 2, minH: 1, maxW: 4, maxH: 2,
    defaultW: 4, defaultH: 1,
  },
  {
    id: 'library-insights',
    name: 'Library Insights',
    description: 'Genre, BPM, key, and energy stats',
    icon: 'PieChart',
    minW: 2, minH: 1, maxW: 4, maxH: 1,
    defaultW: 4, defaultH: 1,
  },
  {
    id: 'playlists',
    name: 'Your Playlists',
    description: 'Playlist card grid',
    icon: 'ListMusic',
    minW: 2, minH: 1, maxW: 4, maxH: 3,
    defaultW: 4, defaultH: 2,
  },
]

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'recently-played', x: 0, y: 0, w: 2, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { i: 'quick-actions',   x: 2, y: 0, w: 2, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 1 },
  { i: 'library-stats',   x: 0, y: 1, w: 2, h: 1, minW: 1, minH: 1, maxW: 4, maxH: 1 },
  { i: 'ai-recommendations', x: 2, y: 1, w: 2, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { i: 'recently-added',  x: 0, y: 2, w: 4, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { i: 'playlists',       x: 0, y: 3, w: 4, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
]

export function getWidgetDefinition(id: string): WidgetDefinition | undefined {
  return WIDGET_CATALOG.find((w) => w.id === id)
}
