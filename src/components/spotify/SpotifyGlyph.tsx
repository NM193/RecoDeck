// Spotify's mark in the app's line style — lucide has no brand icons.
interface SpotifyGlyphProps {
  size?: number
  style?: React.CSSProperties
}

export function SpotifyGlyph({ size = 16, style }: SpotifyGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M7 9.5c3.5-1 7.5-.7 10.5 1" />
      <path d="M7.5 12.7c3-.8 6.2-.5 8.7.9" />
      <path d="M8 15.7c2.3-.6 4.7-.4 6.6.6" />
    </svg>
  )
}
