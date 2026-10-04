// AppShell — CSS Grid root layout with sidebar | main / player areas. The
// toasts show over the main area, just above the player.
import type { ReactNode } from 'react'
import { Toaster } from '../Toaster'
import './AppShell.css'

interface AppShellProps {
  sidebar: ReactNode
  main: ReactNode
  player: ReactNode
}

export function AppShell({ sidebar, main, player }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">{sidebar}</aside>
      <main className="app-shell__main">
        {main}
        <Toaster />
      </main>
      <div className="app-shell__player">{player}</div>
    </div>
  )
}
