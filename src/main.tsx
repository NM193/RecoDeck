import React from 'react'
import ReactDOM from 'react-dom/client'
// The shared controls come before every page's own styles, which win over
// them at equal specificity.
import './styles/controls.css'
import App from './App'
import '@fontsource-variable/inter'
import './styles/globals.css'

// Set default theme (will be overridden by saved setting on app init)
document.documentElement.setAttribute('data-theme', 'midnight')

// The toolbar for annotating the UI for a coding agent. Loaded only in dev,
// so it never reaches a release build.
const Agentation = import.meta.env.DEV
  ? React.lazy(() =>
      import('agentation').then((m) => ({ default: m.Agentation })),
    )
  : null

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    {Agentation && (
      <React.Suspense fallback={null}>
        <Agentation appName="RecoDeck" />
      </React.Suspense>
    )}
  </React.StrictMode>,
)
