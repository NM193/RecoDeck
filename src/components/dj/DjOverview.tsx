// src/components/dj/DjOverview.tsx
// The Overview tab: the chosen cards in the chosen order, one layout for every
// DJ page (spec "Overview and customizing it"). Normally a CSS grid with each
// card at its packed place and natural height; while customizing, the
// indigo bar, react-grid-layout (as on Home) with one row height for every
// card, and "+ Card" pills for the cards not shown.
import { useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import type { Layout, LayoutItem } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Icon } from '../Icon'
import {
  EditCard,
  OverviewCard,
  type OverviewActions,
  type OverviewData,
} from './DjOverviewCards'
import {
  addCard,
  cardPlacement,
  removeCard,
  type OverviewCounts,
} from '../../lib/dj/cards'
import {
  DEFAULT_OVERVIEW,
  hiddenCards,
  orderFromGrid,
  packOverview,
  type DjTab,
  type OverviewCardId,
} from '../../lib/dj/overview'
import type { StatusFilter } from '../../lib/spotify/rows'

const ResponsiveGridLayout = WidthProvider(Responsive)

interface DjOverviewProps {
  /** The stored cards in order (useOverviewLayout); null until read. */
  ids: OverviewCardId[] | null
  /** The sliders button switched editing on. */
  customizing: boolean
  /** Done: the order read off the grid. */
  onDone: (ids: OverviewCardId[]) => void
  data: OverviewData
  actions: OverviewActions
  /** A card title: its tab (Tracks on the Missing chip from the Missing card). */
  onOpenTab: (tab: DjTab, filter: StatusFilter) => void
}

export function DjOverview({
  ids,
  customizing,
  onDone,
  data,
  actions,
  onOpenTab,
}: DjOverviewProps) {
  if (ids === null) return null
  if (customizing)
    return (
      <OverviewEditor
        initial={ids}
        data={data}
        actions={actions}
        onDone={onDone}
      />
    )
  if (ids.length === 0) {
    return (
      <p className="dj-note">
        No cards on the overview. Add some with the sliders button at the end of
        the tabs.
      </p>
    )
  }

  const listed = data.tracksState === 'list'
  const counts: OverviewCounts = {
    upcoming: data.gigs?.upcoming.length ?? null,
    past: data.gigs?.past.length ?? null,
    sets: data.sets?.length ?? null,
    tracks: listed ? data.trackCounts.all : null,
    missing: listed ? data.trackCounts.missing : null,
  }
  return (
    <div className="dj-overview">
      {packOverview(ids).map((item) => (
        <OverviewCard
          key={item.i}
          id={item.i}
          data={data}
          actions={actions}
          counts={counts}
          onOpenTab={onOpenTab}
          style={cardPlacement(item)}
        />
      ))}
    </div>
  )
}

interface OverviewEditorProps {
  /** The stored order when editing began. */
  initial: OverviewCardId[]
  data: OverviewData
  actions: OverviewActions
  onDone: (ids: OverviewCardId[]) => void
}

/**
 * Mounted while customizing, so its draft starts from the stored order each
 * time. The grid's own layout is the draft: after a drag the order is read
 * off it (y, then x), and × / + / Reset re-pack that order. No Cancel (spec).
 */
function OverviewEditor({
  initial,
  data,
  actions,
  onDone,
}: OverviewEditorProps) {
  const [grid, setGrid] = useState<LayoutItem[]>(() => packOverview(initial))
  const order = orderFromGrid(grid)
  const repack = (next: OverviewCardId[]) => setGrid(packOverview(next))
  const hidden = hiddenCards(order)

  return (
    <>
      <div className="dj-editbar">
        <Icon name="SlidersHorizontal" size={14} />
        Customizing the overview · applies to every DJ page
        <span className="dj-editbar__gap" />
        <button
          type="button"
          className="btn"
          onClick={() => repack(DEFAULT_OVERVIEW)}
        >
          Reset
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onDone(order)}
        >
          Done
        </button>
      </div>

      {order.length === 0 ? (
        <p className="dj-note">No cards on the overview. Add some below.</p>
      ) : (
        <ResponsiveGridLayout
          className="dj-overview-grid"
          layouts={{ lg: grid }}
          breakpoints={{ lg: 0 }}
          cols={{ lg: 2 }}
          rowHeight={170}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          isDraggable
          isResizable={false}
          draggableHandle=".dj-card__grip"
          compactType="vertical"
          onLayoutChange={(layout: Layout) => setGrid([...layout])}
        >
          {order.map((id) => (
            <div key={id}>
              <EditCard
                id={id}
                data={data}
                actions={actions}
                onRemove={(card) => repack(removeCard(order, card))}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {hidden.length > 0 && (
        <div className="dj-addc">
          <b>
            <Icon name="Plus" size={14} />
            Add to overview
          </b>
          <div className="dj-addc__pills">
            {hidden.map((card) => (
              <button
                type="button"
                key={card.id}
                className="btn btn--sm"
                onClick={() => repack(addCard(order, card.id))}
              >
                <Icon name="Plus" size={12} />
                {card.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
