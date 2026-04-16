import { Icon } from '../../Icon'
import './WidgetWrapper.css'

interface WidgetWrapperProps {
  title: string
  widgetId: string
  isEditMode: boolean
  onRemove: (widgetId: string) => void
  children: React.ReactNode
}

export function WidgetWrapper({ title, widgetId, isEditMode, onRemove, children }: WidgetWrapperProps) {
  return (
    <div className={`widget-wrapper ${isEditMode ? 'widget-wrapper--editing' : ''}`}>
      {isEditMode && (
        <div className="widget-wrapper__toolbar">
          <span className="widget-wrapper__drag-handle drag-handle">
            <Icon name="GripVertical" size={14} />
            <span className="widget-wrapper__toolbar-title">{title}</span>
          </span>
          <button
            className="widget-wrapper__remove"
            onClick={() => onRemove(widgetId)}
            aria-label={`Remove ${title} widget`}
          >
            <Icon name="X" size={14} />
          </button>
        </div>
      )}
      <div className="widget-wrapper__content">
        {!isEditMode && <h3 className="widget-wrapper__title">{title}</h3>}
        {children}
      </div>
    </div>
  )
}
