# Phase 12: CSS Layout Fix - Research

**Researched:** 2026-03-06
**Domain:** CSS layout — flexbox, overflow, TanStack Virtual, sticky headers
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LAYT-01 | Track table rows extend to the full window width at any window size | Root cause identified: `.track-table-holder` has no `min-width: 100%`, so rows size to content, not the scroll container. Fix: add `min-width: 100%` to `.track-table-holder`. |
| LAYT-02 | Track table header background extends to the full window width at any window size | Same root cause as LAYT-01. The `.track-table-header` and its `.track-table-row` use `width: 100%` relative to `.track-table-holder`, not the scroll area. Same fix resolves both. |
</phase_requirements>

---

## Summary

The track table layout breaks at wide window widths because the inner wrapper div (`.track-table-holder`) shrinks to the sum of its column widths rather than expanding to fill the scroll container. All children—the sticky header row and every virtualized data row—use `width: 100%`, which resolves to the holder's content-sized width rather than the scroll area's full width. This creates a visible whitespace gap to the right of the last column.

The fix is targeted and minimal: add `min-width: 100%` to `.track-table-holder` in `TrackTable.css`. This causes the holder to expand to fill the scroll container when the window is wider than the combined column widths, while still allowing horizontal scrolling when columns are wider than the window.

There is no JavaScript change required. TanStack Virtual measures the scroll container (`.track-table-scroll-area` via `parentRef`), not the holder, so this CSS-only fix does not interfere with virtualization. The virtual rows already receive `width: 100%` as an inline style, which will correctly resolve to the holder's (now full-width) width.

**Primary recommendation:** Add `min-width: 100%` to `.track-table-holder`. No other changes needed for LAYT-01 and LAYT-02.

---

## Root Cause Analysis

### DOM structure (from TrackTable.tsx)

```
.track-table-container          (flex col, height: 100%)
  .track-table-search           (flex-shrink: 0)
  .track-table-scroll-area      (flex: 1, overflow: auto) ← parentRef for TanStack Virtual
    .track-table-holder         (NO explicit width — shrinks to fit content) ← THE BUG
      .track-table-header       (width: 100% of holder → content-sized)
        .track-table-row        (display: flex, width: 100%, min-width: fit-content)
      .track-table-body
        div[height=totalSize]   (width: 100% of holder)
          .track-table-row      (position: absolute, width: 100% of holder)
  .track-table-footer           (flex-shrink: 0)
```

### Why the gap appears

`.track-table-holder` has no width set. The browser sizes it by its flex content: the header row has `min-width: fit-content` (from `.track-table-row`), and the body div has `width: 100%` (of the holder). In a flex layout, the holder collapses to fit-content width, which equals the sum of column widths (approx 48+300+200+70+70+150+80 = 918px of fixed/min widths plus flex growth). When the window is wider than this sum, the holder is narrower than `.track-table-scroll-area`, and all `width: 100%` children reference the holder's smaller width—leaving the scroll area uncovered.

### Why `min-width: 100%` on the holder is the correct fix

- `min-width: 100%` on `.track-table-holder` means: at minimum, fill the scroll container. When the window is wider than column content, the holder stretches to match the scroll area width, and `width: 100%` rows fill the now-wider holder.
- When columns exceed the window width (narrow window), `min-width: 100%` has no effect because content-width already exceeds 100% of the scroll area—horizontal scrolling activates correctly.
- TanStack Virtual's `getScrollElement: () => parentRef.current` points to `.track-table-scroll-area`, which is unchanged. The virtualizer measures `parentRef.current.clientHeight` for viewport height, not the holder's dimensions. Row positioning uses `position: absolute` + `transform: translateY`, both unaffected by the holder's width change.

### Pre-confirmed in STATE.md

From accumulated project research (HIGH confidence, already validated):
> "CSS fix must target .track-table-holder with min-width: 100% — applying to .track-table-row breaks TanStack Virtual width measurement"

This confirms: the fix is on the holder, not the individual rows.

---

## Standard Stack

No new libraries needed. This is a pure CSS fix within the existing stack:

| Technology | Role |
|------------|------|
| CSS (vanilla) | The fix — `min-width: 100%` on `.track-table-holder` |
| TanStack Virtual (`@tanstack/react-virtual`) | Already integrated — no changes |
| TrackTable.css | File to modify |
| TrackTable.tsx | No changes needed |

---

## Architecture Patterns

### Pattern 1: Scroll container + inner holder for virtualizers

The standard pattern for TanStack Virtual with full-width rows:

```
scroll-area (overflow: auto, measured by virtualizer)
  holder (min-width: 100%)   ← ensures full-width background coverage
    header (width: 100%)     ← fills holder, which fills scroll area
    body (width: 100%, position: relative, height: totalSize)
      row (position: absolute, width: 100%)  ← fills holder
```

**Why `min-width: 100%` on holder, not `width: 100%`:**
- `width: 100%` would prevent horizontal scrolling — the holder would never exceed the scroll container even when columns are too wide
- `min-width: 100%` allows the holder to grow beyond 100% when content demands it (column overflow case), while filling to 100% when content is narrower

### Pattern 2: Sticky header within a scrolling container

The header uses `position: sticky; top: 0`. For the background to fill the full scroll area width on horizontal scroll, the header must be at least as wide as the scroll area. With `min-width: 100%` on the holder, the header inherits that full width via `width: 100%`.

**Note:** If horizontal scroll is needed in the future, the sticky header will scroll horizontally with the content (correct behavior — header columns align with data columns). This is already the current design intent.

### Anti-Patterns to Avoid

- **Applying `min-width: 100%` to `.track-table-row` directly:** This would cause TanStack Virtual's row positioning to break — virtual rows are `position: absolute` and their `width` references the nearest positioned ancestor (the body div), which would no longer correctly correspond to the holder. Additionally, the project's STATE.md explicitly flags this as incorrect.
- **Using `width: 100vw` on rows or header:** This ignores the sidebar width and causes overflow at the app-shell level.
- **Setting `overflow-x: hidden` on the scroll area:** This would suppress horizontal scroll but hide content on narrow windows — violates success criterion 3 (horizontal scroll must activate when columns exceed window width).
- **Using JavaScript to set widths on resize:** Not needed. CSS handles this declaratively with no React re-renders.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Full-width rows | JavaScript ResizeObserver to set explicit px widths | `min-width: 100%` on holder |
| Header width sync | JS that measures and copies scroll area width | CSS inheritance via `width: 100%` on header inside a `min-width: 100%` holder |

---

## Common Pitfalls

### Pitfall 1: Confusing percentage width resolution in overflow containers

**What goes wrong:** Developer adds `width: 100%` to `.track-table-holder` instead of `min-width: 100%`. This fixes the gap at wide widths but prevents horizontal scrolling at narrow widths — columns get clipped.

**Why it happens:** `width: 100%` pins the holder to exactly the scroll container width. When columns overflow that width, they are clipped rather than causing scrollbar.

**How to avoid:** Use `min-width: 100%`. This means "at least 100%, grow if content demands more."

**Warning signs:** After fix, try narrowing the window below ~800px. If no horizontal scrollbar appears and content is clipped, the wrong property was used.

### Pitfall 2: Sticky header losing background on wide displays

**What goes wrong:** The header background (`var(--bg-secondary)`) only covers the content-width area. On wide displays, the background ends at the last column, exposing the primary background color.

**Why it happens:** The header's background paints the element's box, which is sized by `width: 100%` of the holder. If the holder is narrower than the scroll area, the background stops there.

**How to avoid:** The `min-width: 100%` fix on the holder also resolves this — the header inherits full width and its background covers the full scroll area.

### Pitfall 3: TanStack Virtual row widths after fix

**What goes wrong:** After adding `min-width: 100%` to the holder, the virtual body div already has `width: 100%`, and virtual rows have `position: absolute; width: 100%`. These should all resolve correctly. However, if a developer additionally tries to set explicit widths on rows, it can break the virtualizer's coordinate system.

**Why it happens:** Virtual rows use `transform: translateY` for positioning, with coordinates derived from `parentRef.current.scrollTop`. Changing row width does not affect this.

**How to avoid:** Touch only `.track-table-holder`. Leave all row and body div width declarations unchanged.

---

## Code Examples

### The fix (TrackTable.css)

```css
/* BEFORE — holder has no explicit width, shrinks to fit-content */
/* .track-table-holder has no rule in current CSS */

/* AFTER — add this rule */
.track-table-holder {
  min-width: 100%;
}
```

That is the complete change required.

### Current problematic structure (for reference)

```css
/* TrackTable.css — current state */
.track-table-row {
  display: flex;
  align-items: center;
  width: 100%;           /* resolves to holder width — too narrow at wide viewports */
  min-width: fit-content;
}

.track-table-header {
  /* no explicit width — inherits from holder */
  background: var(--bg-secondary); /* only covers holder width */
}
```

```tsx
// TrackTable.tsx — virtual row inline style (unchanged after fix)
style={{
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',   // resolves to holder width — correct after fix
  height: `${virtualRow.size}px`,
  transform: `translateY(${virtualRow.start}px)`,
}}
```

### Verification at key widths

After applying the fix, verify:

```
800px window:  rows fill full width, no gap. Header bg covers full width.
1280px window: rows fill full width, no gap. Header bg covers full width.
1920px window: rows fill full width, no gap. Header bg covers full width.
narrow (<700px): horizontal scrollbar appears, columns are not clipped.
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Full-width rows via `width: 100%` on rows directly | `min-width: 100%` on scroll holder, `width: 100%` on rows inherits correctly | Rows fill scroll area at any width without breaking virtualizer |
| JS ResizeObserver to sync widths | Pure CSS — no JS | No re-renders, no timing issues |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4 + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| LAYT-01 | Track table rows fill full window width | visual/manual | n/a | CSS layout — not unit-testable in jsdom (no layout engine) |
| LAYT-02 | Track table header bg fills full window width | visual/manual | n/a | CSS layout — not unit-testable in jsdom |

**Justification for manual-only:** Both requirements test computed CSS layout at specific rendered widths. jsdom does not compute CSS layout (no box model). Playwright/Cypress could snapshot pixel widths but are not part of this project's test stack. The verifier must visually confirm at 800px, 1280px, and 1920px window widths using the running Tauri app.

### Sampling Rate

- **Per task commit:** `npm test` (confirms no TypeScript/logic regressions)
- **Per wave merge:** `npm test` + visual check in running app
- **Phase gate:** Visual confirmation at three window widths before `/gsd:verify-work`

### Wave 0 Gaps

None — no new test files needed. The fix is CSS-only with no logic changes.

---

## Open Questions

None. Root cause is fully understood, fix is confirmed by prior research in STATE.md, and no ambiguity remains.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection of `src/components/TrackTable.tsx` — confirmed `.track-table-holder` has no width rule, virtual rows use `width: 100%`, `parentRef` points to `.track-table-scroll-area`
- Direct code inspection of `src/components/TrackTable.css` — confirmed `.track-table-holder` has no CSS rule, `.track-table-row` has `width: 100%; min-width: fit-content`
- `.planning/STATE.md` accumulated research — "CSS fix must target .track-table-holder with min-width: 100% — applying to .track-table-row breaks TanStack Virtual width measurement"
- MDN CSS specification for `min-width` and percentage resolution in overflow containers — `min-width: 100%` on a block inside `overflow: auto` resolves to the scroll container's content box width as the baseline minimum

### Secondary (MEDIUM confidence)

- TanStack Virtual documentation — `getScrollElement` returns the measured scroll container; row `width` is independent of virtualizer measurements (virtualizer only reads `scrollTop`, `clientHeight`, `scrollHeight`)

---

## Metadata

**Confidence breakdown:**
- Root cause: HIGH — confirmed by direct code inspection and prior project research
- Fix approach: HIGH — confirmed by prior project research in STATE.md, standard CSS pattern
- TanStack Virtual compatibility: HIGH — virtualizer measures scroll container dimensions only; holder width is irrelevant to its calculations
- No regression risk: HIGH — change is additive (new CSS rule on unstyled element), no existing rule overridden

**Research date:** 2026-03-06
**Valid until:** Stable — CSS fundamentals do not change
