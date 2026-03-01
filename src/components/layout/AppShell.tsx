// AppShell — CSS Grid root layout with sidebar | main / player areas
import type { ReactNode } from 'react'
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
      <main className="app-shell__main">{main}</main>
      <div className="app-shell__player">{player}</div>
    </div>
  )
}
