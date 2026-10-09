// src/components/ErrorBoundary.tsx
// What a part of the window shows when it throws while drawing, instead of
// React clearing the whole window: what went wrong, and a way back — Try again
// for a page or a Home card, Reload for the whole app. React itself reports
// the error to the console.
import { Component, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'
import './ErrorBoundary.css'

type Level = 'app' | 'page' | 'card'

const TITLES: Record<Level, string> = {
  app: 'RecoDeck ran into a problem',
  page: 'This page ran into a problem',
  card: "This card couldn't load",
}

interface ErrorBoundaryProps {
  level: Level
  children: ReactNode
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  private retry = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <ErrorNotice
        level={this.props.level}
        error={error}
        onRetry={this.retry}
      />
    )
  }
}

function ErrorNotice({
  level,
  error,
  onRetry,
}: {
  level: Level
  error: Error
  onRetry: () => void
}) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  // WebKit quotes the source that failed: "x is not a function. (In 'x(…)', 'x' is
  // undefined)". The notice shows the sentence; Copy error keeps all of it.
  const message = (error.message || error.name).split(" (In '")[0]
  // V8's stack starts with "TypeError: message"; the name is added where it does not.
  const head = `${error.name}: ${error.message}`
  const details = error.stack?.startsWith(head)
    ? error.stack
    : `${head}\n${error.stack ?? ''}`
  const copyError = () => {
    if (!navigator.clipboard) return setCopy('failed')
    navigator.clipboard.writeText(details).then(
      () => setCopy('copied'),
      () => setCopy('failed'),
    )
  }

  return (
    <div className={`error-notice error-notice--${level}`} role="alert">
      <Icon name="TriangleAlert" size={level === 'card' ? 18 : 28} />
      <p className="error-notice__title">{TITLES[level]}</p>
      <p className="error-notice__message" title={message}>
        {message}
      </p>
      <div className="error-notice__actions">
        {level === 'app' ? (
          <Button
            variant="primary"
            icon="RotateCcw"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        ) : (
          <Button
            icon="RotateCcw"
            size={level === 'card' ? 'sm' : undefined}
            onClick={onRetry}
          >
            Try again
          </Button>
        )}
        {level !== 'card' && (
          <Button
            icon={copy === 'copied' ? 'Check' : 'Copy'}
            onClick={copyError}
          >
            {copy === 'copied'
              ? 'Copied'
              : copy === 'failed'
                ? "Couldn't copy"
                : 'Copy error'}
          </Button>
        )}
      </div>
    </div>
  )
}
