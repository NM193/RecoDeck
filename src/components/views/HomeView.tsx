import { useEffect } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type { Playlist } from '../../types/track'
import { useDashboardStore } from '../../store/dashboardStore'
import { getWidgetDefinition } from './widgets/widgetRegistry'
import { DashboardHeader } from './widgets/DashboardHeader'
import { WidgetWrapper } from './widgets/WidgetWrapper'
import { WidgetCatalog } from './widgets/WidgetCatalog'
import { RecentlyPlayedWidget } from './widgets/RecentlyPlayedWidget'
import { QuickActionsWidget } from './widgets/QuickActionsWidget'
import { LibraryStatsWidget } from './widgets/LibraryStatsWidget'
import { AIRecommendationsWidget } from './widgets/AIRecommendationsWidget'
import { RecentlyAddedWidget } from './widgets/RecentlyAddedWidget'
import { LibraryInsightsWidget } from './widgets/LibraryInsightsWidget'
import { PlaylistsWidget } from './widgets/PlaylistsWidget'
import './HomeView.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

interface HomeViewProps {
  playlists: Playlist[]
  totalTrackCount: number
  folderCount: number
  onPlaylistSelect: (id: number) => void
  onNavigateAIChat: () => void
  onOpenSettings: () => void
}

function renderWidget(
  widgetId: string,
  props: HomeViewProps,
) {
  switch (widgetId) {
    case 'recently-played':
      return <RecentlyPlayedWidget />
    case 'quick-actions':
      return (
        <QuickActionsWidget
          onNavigateAIChat={props.onNavigateAIChat}
          onOpenSettings={props.onOpenSettings}
        />
      )
    case 'library-stats':
      return (
        <LibraryStatsWidget
          totalTracks={props.totalTrackCount}
          playlistCount={props.playlists.filter((p) => p.playlist_type === 'manual' || p.playlist_type === 'ai').length}
          folderCount={props.folderCount}
        />
      )
    case 'ai-recommendations':
      return <AIRecommendationsWidget onNavigateAIChat={props.onNavigateAIChat} />
    case 'recently-added':
      return <RecentlyAddedWidget />
    case 'library-insights':
      return <LibraryInsightsWidget />
    case 'playlists':
      return (
        <PlaylistsWidget
          playlists={props.playlists}
          onPlaylistSelect={props.onPlaylistSelect}
        />
      )
    default:
      return null
  }
}

export function HomeView(props: HomeViewProps) {
  const {
    layout,
    isEditMode,
    isLoaded,
    loadLayout,
    enterEditMode,
    cancelEdit,
    saveLayout,
    updateLayout,
    addWidget,
    removeWidget,
  } = useDashboardStore()

  useEffect(() => {
    if (!isLoaded) {
      loadLayout()
    }
  }, [isLoaded, loadLayout])

  const handleAddWidget = (widgetId: string) => {
    const def = getWidgetDefinition(widgetId)
    if (def) {
      addWidget(widgetId, def)
    }
  }

  return (
    <div className="home-view">
      <DashboardHeader
        isEditMode={isEditMode}
        onCustomize={enterEditMode}
        onSave={saveLayout}
        onCancel={cancelEdit}
      />

      <div className="home-view__body">
        {isEditMode && (
          <WidgetCatalog
            currentLayout={layout}
            onAddWidget={handleAddWidget}
          />
        )}

        <div className="home-view__grid-container">
          <ResponsiveGridLayout
            className="home-view__grid"
            layouts={{ lg: layout }}
            breakpoints={{ lg: 0 }}
            cols={{ lg: 4 }}
            rowHeight={120}
            isDraggable={isEditMode}
            isResizable={isEditMode}
            draggableHandle=".drag-handle"
            compactType="vertical"
            onLayoutChange={(newLayout) => {
              if (isEditMode) {
                updateLayout(newLayout)
              }
            }}
          >
            {layout.map((item) => {
              const def = getWidgetDefinition(item.i)
              return (
                <div key={item.i}>
                  <WidgetWrapper
                    title={def?.name ?? item.i}
                    widgetId={item.i}
                    isEditMode={isEditMode}
                    onRemove={removeWidget}
                  >
                    {renderWidget(item.i, props)}
                  </WidgetWrapper>
                </div>
              )
            })}
          </ResponsiveGridLayout>
        </div>
      </div>
    </div>
  )
}
