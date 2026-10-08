// src/components/views/HomeView.tsx
// Home: a grid of cards (Home cards spec). react-grid-layout, 4 columns,
// rows of 120px; while customizing, cards are dragged by their title,
// resized from their corner and removed with ×, and the catalog adds them.
import { useEffect, useMemo } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useDashboardStore } from '../../store/dashboardStore'
import { HOME_COLUMNS } from '../../lib/home/cards'
import { HomeCard, type HomeActions, type HomeFacts } from '../home/HomeCards'
import { HomeCatalog } from '../home/HomeCatalog'
import { HomeHeader } from '../home/HomeHeader'
import { useHomeData } from '../home/useHomeData'
import './HomeView.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

/** The grid's row height and the gap between cards, in pixels. */
const ROW_HEIGHT = 120
const GAP = 12

interface HomeViewProps extends HomeFacts, HomeActions {
  /** App raises it after a play, an analysis and a rescan: the cards read again. */
  dataVersion: number
}

export function HomeView({
  dataVersion,
  playlists,
  totalTrackCount,
  folderCount,
  spotify,
  youtubeMusic,
  ...actions
}: HomeViewProps) {
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
    resetLayout,
  } = useDashboardStore()

  useEffect(() => {
    if (!isLoaded) loadLayout()
  }, [isLoaded, loadLayout])

  // Nothing is read until the stored layout says which cards are on Home.
  const shown = useMemo(
    () => (isLoaded ? layout.map((item) => item.i) : []),
    [isLoaded, layout],
  )
  // Last playlist reads again when a playlist is renamed or its tracks change.
  const playlistsKey = useMemo(
    () => playlists.map((p) => `${p.id}:${p.track_count}:${p.name}`).join('\n'),
    [playlists],
  )
  const data = useHomeData(shown, dataVersion, playlistsKey)
  const facts: HomeFacts = {
    playlists,
    totalTrackCount,
    folderCount,
    spotify,
    youtubeMusic,
  }

  return (
    <div className="home-view">
      <HomeHeader
        editing={isEditMode}
        onCustomize={enterEditMode}
        onReset={resetLayout}
        onCancel={cancelEdit}
        onSave={saveLayout}
      />

      <div className="home-view__body">
        {isEditMode && <HomeCatalog shown={new Set(shown)} onAdd={addWidget} />}

        <div className="home-view__grid-container">
          {isLoaded && (
            <ResponsiveGridLayout
              className="home-view__grid"
              layouts={{ lg: layout }}
              breakpoints={{ lg: 0 }}
              cols={{ lg: HOME_COLUMNS }}
              rowHeight={ROW_HEIGHT}
              margin={[GAP, GAP]}
              containerPadding={[0, 0]}
              isDraggable={isEditMode}
              isResizable={isEditMode}
              draggableHandle=".home-card__head"
              draggableCancel=".home-card__remove"
              compactType="vertical"
              onLayoutChange={(next: Layout) => {
                if (isEditMode) updateLayout([...next])
              }}
            >
              {layout.map((item) => (
                <div key={item.i}>
                  <HomeCard
                    id={item.i}
                    columns={item.w}
                    editing={isEditMode}
                    onRemove={removeWidget}
                    data={data}
                    facts={facts}
                    actions={actions}
                  />
                </div>
              ))}
            </ResponsiveGridLayout>
          )}
        </div>
      </div>
    </div>
  )
}
