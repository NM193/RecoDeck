// src/components/layout/sidebarTypes.ts
// Types shared by the full sidebar (Sidebar.tsx) and the icon rail (SidebarRail.tsx).
import type { IconName } from '../Icon'
import type { SidebarSection } from '../../lib/sidebarPrefs'
import type { SpotifyList } from '../../types/spotify'

/** A top-level nav entry: a button in the full sidebar, an icon in the rail. */
export interface NavItem {
  section: SidebarSection
  label: string
  icon: IconName
  onClick: () => void
  count?: number
}

/** The sections the rail shows as an icon that opens a flyout. A section
 *  joins by adding its SidebarSection name here. */
export type FlyoutSection = Extract<SidebarSection, 'folders' | 'playlists' | 'spotify'>

/** What the SPOTIFY section shows. Absent while no account is connected. */
export interface SidebarSpotify {
  lists: SpotifyList[]
  /** Rows behind each item, plus ALL_LISTS. */
  counts: Map<string, number>
  /** Distinct new-and-missing tracks: the header's (and the rail icon's) number. */
  newTotal: number
  newByList: Map<string, number>
  activeListId: string | null
  onOpenList: (listId: string) => void
}
