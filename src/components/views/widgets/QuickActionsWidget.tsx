import { Icon } from '../../Icon'

interface QuickActionsWidgetProps {
  onNavigateAIChat?: () => void
  onOpenSettings: () => void
}

export function QuickActionsWidget({ onNavigateAIChat, onOpenSettings }: QuickActionsWidgetProps) {
  return (
    <div className="widget-actions">
      <button className="widget-actions__btn" onClick={onNavigateAIChat}>
        <Icon name="Sparkles" size={18} />
        <span>AI Playlist</span>
      </button>
      <button className="widget-actions__btn" onClick={onNavigateAIChat}>
        <Icon name="MessageSquare" size={18} />
        <span>AI Chat</span>
      </button>
      <button className="widget-actions__btn" onClick={onOpenSettings}>
        <Icon name="FolderPlus" size={18} />
        <span>Import</span>
      </button>
    </div>
  )
}
