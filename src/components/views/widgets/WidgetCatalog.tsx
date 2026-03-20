import { Icon } from '../../Icon'
import { WIDGET_CATALOG } from './widgetRegistry'
import type { LayoutItem } from 'react-grid-layout/legacy'
import './WidgetCatalog.css'

interface WidgetCatalogProps {
  currentLayout: LayoutItem[]
  onAddWidget: (widgetId: string) => void
}

export function WidgetCatalog({ currentLayout, onAddWidget }: WidgetCatalogProps) {
  const activeWidgetIds = new Set(currentLayout.map((item) => item.i))

  return (
    <div className="widget-catalog">
      <div className="widget-catalog__header">Widget Catalog</div>
      <div className="widget-catalog__list">
        {WIDGET_CATALOG.map((widget) => {
          const isActive = activeWidgetIds.has(widget.id)
          return (
            <button
              key={widget.id}
              className={`widget-catalog__item ${isActive ? 'widget-catalog__item--active' : ''}`}
              onClick={() => !isActive && onAddWidget(widget.id)}
              disabled={isActive}
            >
              <div className="widget-catalog__item-icon">
                <Icon name={widget.icon as any} size={16} />
              </div>
              <div className="widget-catalog__item-info">
                <span className="widget-catalog__item-name">{widget.name}</span>
                <span className="widget-catalog__item-desc">{widget.description}</span>
              </div>
              {isActive && <span className="widget-catalog__item-badge">Added</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
