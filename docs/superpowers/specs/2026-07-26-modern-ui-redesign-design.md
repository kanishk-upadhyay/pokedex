# Modern-UI redesign (Rotom-Phone direction)

## Context

Current screens (main sprite view, details panel, search, suggestions list) mix
eras of nostalgia: full-color Gen 5+ sprite art and modern PokéAPI data
(`terapagos-stellar`, `N°10277`) sit inside a UI styled with system fonts, a
glowing yellow retro title, and ad-hoc inline labels. A prior direction
(dithered DMG-green screens) was considered and rejected: the sprites are
full-color, not monochrome, so draping Game Boy LCD green over them mixes two
hardware eras and reads as costume rather than a coherent aesthetic.

The chosen direction instead treats the device shell (red case, D-pad, camera
lens, LED cluster) as the nostalgia layer — a toy — and the screens as a
modern, legible database UI inside it, the same way Sword/Shield's in-fiction
Rotom Phone dex is a flat modern interface inside a gadget. This matches what
the app actually is: a PokéAPI-backed lookup tool with live search counts and
modern form/ID data, not an emulator.

This is a **re-skin, not a restructure**: DOM structure and layout regions
(left/right panel, main-screen, d-pad, suggestions list, evolution chain)
stay as they are. Only typography, color/accent usage, and small element
composition (splitting one line into two, swapping an inline label for a
stacked eyebrow) change.

## Goals

- Replace the mixed-era retro/modern look with a single coherent concept:
  toy shell, modern-UI screens.
- Establish one consistent accent color for "interactive/selected" state
  inside the screens, replacing ad-hoc yellow-glow reuse.
- Improve legibility of dex numbers, Pokémon names (including hyphenated
  forms), and section labels without changing what data is shown.
- Do this without touching the CSP (`style-src 'self'; font-src 'self'`) or
  the offline-first PWA guarantee — no external font/style origins.

## Non-goals

- No DOM/layout restructuring (panel positions, grid layout, evolution-chain
  layout stay as-is).
- No change to type-chip colors (already canonical, already correct).
- No change to D-pad / camera-lens / shell button focus styling (still
  yellow `:focus-visible` — those are shell chrome, not screen UI).
- No sprite processing/dithering (that belonged to the rejected DMG
  direction).

## Fonts

Three self-hosted fonts, replacing the current single system-font stack:

- **Outfit** (700) — headings: `.pokedex-title`, `.pokemon-name`.
- **Inter** (400, 500) — body/detail text, eyebrow labels.
- **JetBrains Mono** (400) — dex numbers (`N°025`), and slots that are
  already monospace today (move/ability text, suggestion dex number).

Mechanics:
- Fonts are downloaded as `.woff2` (only the weights listed above) and
  committed under `assets/fonts/`.
- `@font-face` declarations + `font-display: swap` added to `style.css`.
- `--font-family-main` is replaced by `--font-heading`, `--font-body`,
  `--font-mono`, each with the current system-font stack as a fallback list,
  so a missing/blocked font file degrades gracefully rather than breaking
  layout.
- No CSP changes: fonts are same-origin, self-hosted files. `font-src 'self'`
  already permits this.
- License: confirm Outfit, Inter, and JetBrains Mono are all licensed for
  redistribution (all three are SIL Open Font License in their standard
  Google Fonts / JetBrains distributions) and include the license file(s)
  alongside the font assets per OFL terms.

## Color / accent

- New CSS var `--color-accent: #35C2C8` (cyan) — the single
  "interactive/selected" signal for elements *inside the screens*:
  - `.suggestion-button` selected/hover: cyan left-bar (recolor the existing
    bar mechanic already in place) + subtle background tint + brighter text.
  - Any other in-screen hover/active affordance that currently borrows the
    yellow glow gets migrated to this cyan accent.
- `.pokedex-title` drops its yellow text-shadow/glow stack entirely; switches
  to Outfit 700 with tight letter-spacing, no glow. Yellow is no longer a
  general-purpose accent — it remains only on the LED cluster and shell
  `:focus-visible` outlines (unchanged, out of scope).
- Type-chip colors (`--color-fire`, `--color-water`, etc.) are unchanged —
  already canonical and already the one place external data legitimately
  drives color.

## Details panel

- **Name / ID split**: `.pokemon-name` (currently one `<h3>` with name +
  inline `" - {id}"` span) becomes two lines: name on top (Outfit), dex
  number below (`N°025` format, JetBrains Mono, muted secondary color) —
  matching the format `_createSuggestionItem` already uses for dex numbers.
- **New `js/format.js`** (pure module, mirrors the existing `search.js` /
  test-style pattern):
  - `formatPokemonName(name)` — splits hyphenated form names into a
    title-cased base plus a parenthesized, title-cased suffix, e.g.
    `"terapagos-stellar"` → `"Terapagos (Stellar)"`. Plain names pass through
    title-cased with no parens.
  - Applied to `.pokemon-name` display text (and reused in suggestions list
    for consistency, since that already shows raw names).
  - Unit-tested via `node --test` (`js/format.test.js`), following the
    existing test convention in the repo.
- **Eyebrow labels**: `<strong>Type:</strong>`, `Abilities:`, `Moves:`,
  `Evolutions:` inline bold prefixes become `.detail-eyebrow` spans (Inter,
  ~10px, uppercase, letter-spaced, muted color) placed above each value
  instead of inline before it. Colons are dropped from the label text.
- Type chips, move/ability rendering, and evolution-chain rendering are
  otherwise unchanged in this pass.

## Testing / verification

- `node --test` — existing suite plus new `format.test.js` cases, all
  passing.
- Manual browser check (chrome-devtools MCP): confirm fonts load (network
  tab shows same-origin woff2 requests, no CSP violations in console),
  title/name typography, cyan accent on suggestion hover/selection, stacked
  name/dex-number, eyebrow labels, hyphenated-form name formatting (e.g. a
  Pokémon with a form suffix), no regression to D-pad/camera-lens/shell
  focus styling (still yellow).
- Visual check at a few breakpoints given `html { font-size: clamp(...) }` —
  confirm the new fonts remain legible at the small end of that clamp.

## Out of scope / explicitly deferred

- Sprite dithering / monochrome recolor (belonged to the rejected DMG
  direction, not needed here).
- Any layout/grid restructuring of the details panel or evolution chain.
- Further accent-color usage decisions beyond the suggestion-list hover
  state (kept minimal per YAGNI — expand later if a concrete need appears).
