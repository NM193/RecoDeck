import { Icon } from '../../Icon'

interface AIRecommendationsWidgetProps {
  onNavigateAIChat: () => void
}

export function AIRecommendationsWidget({ onNavigateAIChat }: AIRecommendationsWidgetProps) {
  return (
    <div className="widget-recommendations">
      <p className="widget-recommendations__hint">
        Use AI Chat to get personalized track and playlist recommendations based on your library.
      </p>
      <button className="widget-recommendations__cta" onClick={onNavigateAIChat}>
        <Icon name="Sparkles" size={14} />
        Open AI Chat
      </button>
    </div>
  )
}
