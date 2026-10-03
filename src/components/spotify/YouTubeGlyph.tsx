// YouTube's mark in the app's line style — lucide has no brand icons.
interface YouTubeGlyphProps {
  size?: number
  style?: React.CSSProperties
}

export function YouTubeGlyph({ size = 16, style }: YouTubeGlyphProps) {
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
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
    </svg>
  )
}
