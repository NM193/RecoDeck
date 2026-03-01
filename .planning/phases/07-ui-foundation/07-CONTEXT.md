# Phase 7: UI Foundation - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a consistent Spotify-style visual language as design tokens and a component library that every screen in the app uses. Replace all hardcoded hex colors with tokens. Unify buttons, inputs, cards, and modals into a shared styled component system.

</domain>

<decisions>
## Implementation Decisions

### Color palette & themes
- Replace the default theme (midnight) with a Spotify-style dark palette using warmer neutral blacks (#121212 base), not the current cool blue-tinted darks (#0a0a0f)
- Keep indigo (#6366f1) as the accent color — RecoDeck's distinctive identity, not a Spotify green clone
- Keep other themes (carbon, dawn, neon, custom) as options — just rebuild the default
- Add semantic color tokens: --color-success, --color-danger, --color-warning, --color-info
- Replace all 119 hardcoded hex colors across component CSS files with design tokens

### Typography
- Switch from system fonts to Inter
- Clear hierarchy in type scale — big, bold page titles, distinct section headers (Spotify's "Good evening" style)
- Three font weights: Regular (400) for body, Medium (500) for buttons/labels, Bold (700) for headings

### Density & feel
- Balanced music player density — comfortable but efficient, like Spotify (not compact DJ tool, not spacious listening app)

### Component visual style
- Moderate rounding: 6-8px border-radius on buttons, inputs, cards. Not pill-shaped, not sharp.
- Subtle borders for container elevation — flat, minimal, Spotify-like. No drop shadows for cards/panels.
- Centered modals with backdrop blur — keep current settings panel approach for all dialogs

### Spacing system
- 4px base grid (steps: 4, 8, 12, 16, 20, 24, 32, 48). Fine-grained control, Tailwind default.
- Tighter spacing inside sidebar, roomier main content area — like Spotify
- Comfortable section spacing: 20-24px between major sections
- Standard input height: 36-40px for comfortable click targets

### Claude's Discretion
- Button variant count and naming (determine from actual usage in codebase)
- Exact type scale values (sizes in px/rem)
- Loading skeleton and empty state visual treatment
- Exact token names and CSS variable naming convention
- How to structure the shared component system (React components, CSS classes, or both)

</decisions>

<specifics>
## Specific Ideas

- Default theme should feel like Spotify's dark mode but with indigo instead of green — warm blacks + indigo accent
- Typography should have Spotify's "Good evening" level of visual hierarchy — page titles that anchor each view
- Sidebar should feel compact and navigation-focused, main content should breathe

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- CSS variables already established in globals.css (--bg-primary, --bg-secondary, --bg-tertiary, --text-primary, --text-secondary, --accent, --border, --surface)
- Tailwind config (tailwind.config.js) maps to CSS variables — token system is partially in place
- Button classes (.btn-primary, .btn-secondary) exist in App.css
- Settings panel modal pattern (centered, blur backdrop) in Settings.css
- 5 complete theme definitions in globals.css with CSS custom properties on :root[data-theme]

### Established Patterns
- Theme switching via data-theme attribute on :root
- CSS custom properties for all theme-dependent colors
- Component-specific CSS files alongside TSX files (co-located styles)
- Tailwind utility classes mixed with custom CSS

### Integration Points
- globals.css is the central theme/token source — all token changes go here
- tailwind.config.js must stay in sync with CSS variable additions
- Every component CSS file (10 files, 119 hardcoded hex colors) needs token migration
- Font loading needs setup for Inter (currently system fonts only)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-ui-foundation*
*Context gathered: 2026-03-01*
