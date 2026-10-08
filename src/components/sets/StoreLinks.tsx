// src/components/sets/StoreLinks.tsx
// Where a DJ would go looking for a record (Sets redesign spec, Track rows):
// Spotify, Beatport, Discogs and Bandcamp searches for it, kept out of the
// way until the row is hovered.
import { openUrl } from '@tauri-apps/plugin-opener'

/** Where a DJ would go looking for a record they do not own yet. */
function storeLinks(artist: string | null | undefined, title: string, mix?: string | null) {
  const query = encodeURIComponent([artist, title, mix].filter(Boolean).join(' '))
  return [
    { name: 'Beatport', url: `https://www.beatport.com/search?q=${query}` },
    { name: 'Discogs', url: `https://www.discogs.com/search/?q=${query}&type=release` },
    { name: 'Bandcamp', url: `https://bandcamp.com/search?q=${query}` },
    { name: 'Spotify', url: `https://open.spotify.com/search/${query}` },
  ]
}

/** Kept out of the way until the row is hovered, so 42 rows stay readable. */
export function StoreLinks({
  artist,
  title,
  mix,
  className = '',
}: {
  artist: string | null | undefined
  title: string
  mix?: string | null
  className?: string
}) {
  return (
    <span className={`sets-stores ${className}`}>
      {storeLinks(artist, title, mix).map((link) => (
        <button
          key={link.name}
          type="button"
          className="sets-store-link"
          onClick={(e) => {
            e.stopPropagation()
            void openUrl(link.url)
          }}
        >
          {link.name}
        </button>
      ))}
    </span>
  )
}
