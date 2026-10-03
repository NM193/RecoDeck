// The items under SPOTIFY: All playlists, Liked Songs, then each playlist in
// Spotify's order. Used by the full sidebar and by the rail's flyout; styled
// with FolderTree's rows so it looks like the sections above it.
import { Icon } from '../Icon'
import { ALL_LISTS, LIKED, type SpotifyList } from '../../types/spotify'

interface SpotifyListsProps {
  lists: SpotifyList[]
  /** Rows behind each item, plus ALL_LISTS. */
  counts: Map<string, number>
  /** New-and-missing per list; absent means none. */
  newByList: Map<string, number>
  activeListId: string | null
  onOpen: (listId: string) => void
}

export function SpotifyLists({
  lists,
  counts,
  newByList,
  activeListId,
  onOpen,
}: SpotifyListsProps) {
  const item = (
    id: string,
    name: string,
    icon: 'ListMusic' | 'Heart',
    fresh: number,
  ) => (
    <button
      key={id}
      type="button"
      className={`folder-row spotify-list-row ${activeListId === id ? 'selected' : ''}`}
      onClick={() => onOpen(id)}
      title={name}
    >
      <Icon name={icon} size={14} className="spotify-list-row__icon" />
      <span className="folder-name">{name}</span>
      {fresh > 0 && <span className="spotify-list-row__new">{fresh}</span>}
      <span className="folder-count">({counts.get(id) ?? 0})</span>
    </button>
  )

  return (
    <div className="folder-tree-section-body">
      {/* All playlists carries no number: the header already holds the distinct total. */}
      {item(ALL_LISTS, 'All playlists', 'ListMusic', 0)}
      {lists.map((list) =>
        item(
          list.id,
          list.name,
          list.id === LIKED ? 'Heart' : 'ListMusic',
          newByList.get(list.id) ?? 0,
        ),
      )}
    </div>
  )
}
