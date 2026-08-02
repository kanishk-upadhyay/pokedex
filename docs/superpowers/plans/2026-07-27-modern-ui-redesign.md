# Modern-UI Redesign Implementation Plan

> **Status: COMPLETE.** All tasks in this plan have been implemented, tested, and merged into `modern-ui-redesign`. Checkboxes below were not retroactively checked off; treat this note as authoritative over the unchecked `- [ ]` markers throughout the rest of the file.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Pokédex screens (details panel, search, suggestions list, title) with self-hosted modern fonts (Outfit/Inter/JetBrains Mono), a single cyan accent color for in-screen interactive/selected state, and small element-composition changes (stacked name/dex-number, eyebrow labels, formatted form names) — while leaving DOM structure, layout regions, shell chrome (D-pad/camera-lens/LED), and type-chip colors untouched.

**Architecture:** Pure CSS/typography/markup-detail changes on top of the existing vanilla-JS element-builder pattern (`el()` from `js/dom.js`). One new pure logic module (`js/format.js`) for name formatting, unit-tested with `node --test` following the existing `search.test.js` convention. Fonts are downloaded once as woff2 files and committed to the repo (self-hosted, same-origin, no CSP change), then wired up via `@font-face` in `style.css` and precached by the existing service worker.

**Tech Stack:** Vanilla JS (ES modules, no build step), vanilla CSS with custom properties, `node --test` for unit tests, existing service worker (`sw.js`) for precaching.

## Global Constraints

- No new runtime dependencies (project is dependency-free vanilla JS — see `package.json`).
- No CSP changes: `style-src 'self'; font-src 'self'` stays as-is (`index.html:8`). Fonts must be same-origin.
- No DOM/layout restructuring — same panels, same regions, same elements, only new skin (per spec: "Non-goals").
- Shell chrome (D-pad, camera lens, LED cluster, `:focus-visible` outlines on `.d-pad-*`, `.camera-lens`, `.yellow-button`, `.blue-button`) keeps its existing yellow focus-outline styling — unchanged (spec: "Non-goals").
- Type-chip colors (`--color-fire`, `--color-water`, etc. in `css/style.css:4-21`) are unchanged.
- Font licensing: Outfit, Inter, and JetBrains Mono are all SIL Open Font License (OFL) in their Google Fonts distributions — redistribution is permitted; include license text alongside the font assets.
- New CSS var `--color-accent: #35C2C8` is the only new accent color; it replaces yellow-glow reuse *inside the screens* only (suggestion-list hover/selected state).
- Follow existing repo conventions: SPDX header (`// SPDX-License-Identifier: GPL-3.0-or-later`) at the top of every new JS file, `node --test` for tests, terse imperative commit messages, no AI co-author trailer.

---

## File Structure

- **Create `assets/fonts/outfit-700.woff2`** — Outfit Bold, self-hosted.
- **Create `assets/fonts/inter-400.woff2`** — Inter Regular, self-hosted.
- **Create `assets/fonts/inter-500.woff2`** — Inter Medium, self-hosted.
- **Create `assets/fonts/jetbrains-mono-400.woff2`** — JetBrains Mono Regular, self-hosted.
- **Create `assets/fonts/OFL.txt`** — SIL Open Font License text (shared by all three families; each font is separately OFL-licensed, one copy of the license text is sufficient since it's a single shared license).
- **Create `js/format.js`** — pure name-formatting logic (`formatPokemonName`).
- **Create `js/format.test.js`** — unit tests for `js/format.js`, following `js/search.test.js` conventions.
- **Modify `css/style.css`** — `@font-face` declarations, new `--font-heading`/`--font-body`/`--font-mono`/`--color-accent` vars, title glow removal, suggestion-list accent recolor, `.pokemon-name`/`.pokemon-id` split-line styling, new `.detail-eyebrow` class.
- **Modify `js/ui.js`** — `_renderDetails`: split name/id into two lines, apply `formatPokemonName`, replace inline `<strong>` labels with `.detail-eyebrow` spans; `_createSuggestionItem`: apply `formatPokemonName` to suggestion name text.
- **Modify `sw.js`** — add the four font files to `STATIC_FILES` so they're precached with the app shell; bump `VERSION`.

---

## Task 1: Fetch and commit self-hosted font files

**Files:**
- Create: `assets/fonts/outfit-700.woff2`
- Create: `assets/fonts/inter-400.woff2`
- Create: `assets/fonts/inter-500.woff2`
- Create: `assets/fonts/jetbrains-mono-400.woff2`
- Create: `assets/fonts/OFL.txt`

**Interfaces:**
- Produces: four woff2 files at the paths above, referenced by `@font-face` `src: url(...)` in Task 2.

- [ ] **Step 1: Download the four woff2 files from Google Fonts' CSS2 API**

Google Fonts' `css2` endpoint returns different font formats depending on the `User-Agent` header — a modern desktop Chrome UA gets woff2 URLs with no `unicode-range` splitting for the Latin-only weights needed here. Run:

```bash
mkdir -p assets/fonts
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Get the CSS which contains the actual woff2 URLs (URLs are versioned and will differ per fetch; extract them fresh)
curl -s "https://fonts.googleapis.com/css2?family=Outfit:wght@700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" -A "$UA" --max-time 10 -o /tmp/pokedex/gfonts.css

# Print it to find the single (non unicode-range-split) Latin URL for each family+weight
cat /tmp/pokedex/gfonts.css
```

Expected: CSS output containing `@font-face` blocks for `Inter` (400 and 500), `JetBrains Mono` (400), and `Outfit` (700). For each, find the `@font-face` block whose `unicode-range` is `U+0000-00FF, U+0131, U+0152-0153, ...` (the base Latin subset — every Google Font has exactly one `@font-face` per weight with this unicode-range) and note its `src: url(...)` value.

- [ ] **Step 2: Download each font file to its final path**

```bash
# Replace each URL below with the one found in Step 1 for that family/weight
curl -s -o assets/fonts/inter-400.woff2 "<INTER_400_URL_FROM_STEP_1>" --max-time 10
curl -s -o assets/fonts/inter-500.woff2 "<INTER_500_URL_FROM_STEP_1>" --max-time 10
curl -s -o assets/fonts/jetbrains-mono-400.woff2 "<JETBRAINS_MONO_400_URL_FROM_STEP_1>" --max-time 10
curl -s -o assets/fonts/outfit-700.woff2 "<OUTFIT_700_URL_FROM_STEP_1>" --max-time 10
```

- [ ] **Step 3: Verify each file is a valid woff2**

```bash
file assets/fonts/*.woff2
```

Expected: all four lines report `Web Open Font Format (Version 2)`.

- [ ] **Step 4: Add the OFL license text**

```bash
curl -s -o assets/fonts/OFL.txt "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt" --max-time 10
head -5 assets/fonts/OFL.txt
```

Expected: first line reads `Copyright ...` and the file contains "SIL OPEN FONT LICENSE".

- [ ] **Step 5: Commit**

```bash
git add assets/fonts/
git commit -m "Add self-hosted Outfit, Inter, and JetBrains Mono font files"
```

---

## Task 2: Wire up @font-face and new typography/accent CSS variables

**Files:**
- Modify: `css/style.css:2-40` (`:root` block)
- Modify: `css/style.css:60-78` (`.pokedex-title`)

**Interfaces:**
- Consumes: `assets/fonts/*.woff2` from Task 1.
- Produces: CSS custom properties `--font-heading`, `--font-body`, `--font-mono`, `--color-accent`, usable by all later tasks.

- [ ] **Step 1: Add @font-face declarations at the top of `css/style.css`, after the SPDX header**

Insert immediately after line 1 (`/* SPDX-License-Identifier: GPL-3.0-or-later */`), before `:root {`:

```css
@font-face {
    font-family: "Outfit";
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url("../assets/fonts/outfit-700.woff2") format("woff2");
}

@font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("../assets/fonts/inter-400.woff2") format("woff2");
}

@font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: url("../assets/fonts/inter-500.woff2") format("woff2");
}

@font-face {
    font-family: "JetBrains Mono";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("../assets/fonts/jetbrains-mono-400.woff2") format("woff2");
}
```

- [ ] **Step 2: Replace `--font-family-main` with three role-based font vars, and add `--color-accent`**

In the `:root` block, find:

```css
    /* UI colors */
    --color-bg: #000;
    --color-text: #fff;
    --color-text-secondary: #fff5e0;
    --color-pokedex: #e61515;
    --color-pokedex-border: #b00000;
    --color-shadow-yellow: rgba(255, 204, 0, 0.7);
```

Replace with (adds `--color-accent`):

```css
    /* UI colors */
    --color-bg: #000;
    --color-text: #fff;
    --color-text-secondary: #fff5e0;
    --color-pokedex: #e61515;
    --color-pokedex-border: #b00000;
    --color-shadow-yellow: rgba(255, 204, 0, 0.7);
    --color-accent: #35c2c8;
```

Then find:

```css
    /* Typography */
    --font-family-main:
        -apple-system, BlinkMacSystemFont, "avenir next", avenir, "segoe ui",
        "helvetica neue", "Adwaita Sans", Cantarell, Ubuntu, Roboto, Noto,
        helvetica, arial, sans-serif;
```

Replace with:

```css
    /* Typography */
    --font-family-main:
        -apple-system, BlinkMacSystemFont, "avenir next", avenir, "segoe ui",
        "helvetica neue", "Adwaita Sans", Cantarell, Ubuntu, Roboto, Noto,
        helvetica, arial, sans-serif;
    --font-heading: "Outfit", var(--font-family-main);
    --font-body: "Inter", var(--font-family-main);
    --font-mono: "JetBrains Mono", "Courier New", monospace;
```

(`--font-family-main` is kept as-is and reused as the fallback tail for `--font-heading`/`--font-body`, and as `body`'s font — see Step 3 — since `body`'s general text still uses the system stack as its base per the spec's "graceful degradation" requirement; `--font-body` is applied selectively to the panels that need it in Task 4.)

- [ ] **Step 3: Remove the title glow, switch `.pokedex-title` to Outfit**

Find:

```css
/* Title styling */
.pokedex-title {
    color: #ffcc00;
    font-size: 3rem;
    text-transform: uppercase;
    margin-bottom: 20px;
    letter-spacing: 4px;
    text-shadow:
        0 0 10px var(--color-shadow-yellow),
        0 0 20px rgba(255, 204, 0, 0.5),
        0 0 30px rgba(255, 204, 0, 0.3);
```

Replace with (drops `text-shadow`, adds `font-family`/`font-weight`, tightens letter-spacing per spec):

```css
/* Title styling */
.pokedex-title {
    color: #ffcc00;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 3rem;
    text-transform: uppercase;
    margin-bottom: 20px;
    letter-spacing: 2px;
```

Leave the rest of the `.pokedex-title` rule (closing brace and any following properties) untouched — check the file for what follows line 70 before editing, since only the `text-shadow` lines are being removed.

- [ ] **Step 4: Manually verify no syntax errors**

```bash
node -e "require('fs').readFileSync('css/style.css','utf8')" && echo "file readable"
grep -c "@font-face" css/style.css
```

Expected: `file readable`, and the count is `4`.

- [ ] **Step 5: Commit**

```bash
git add css/style.css
git commit -m "Wire up self-hosted fonts and a cyan accent color variable"
```

---

## Task 3: `js/format.js` — Pokémon name formatting (TDD)

**Files:**
- Create: `js/format.js`
- Create: `js/format.test.js`

**Interfaces:**
- Produces: `formatPokemonName(name: string): string`, exported from `js/format.js`. Consumed by Task 4 (`js/ui.js` `_renderDetails` and `_createSuggestionItem`).

- [ ] **Step 1: Write the failing test file**

Create `js/format.test.js`:

```javascript
// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPokemonName } from "./format.js";

test("formatPokemonName: plain name is title-cased", () => {
  assert.equal(formatPokemonName("pikachu"), "Pikachu");
  assert.equal(formatPokemonName("charizard"), "Charizard");
});

test("formatPokemonName: hyphenated form splits base and suffix", () => {
  assert.equal(formatPokemonName("terapagos-stellar"), "Terapagos (Stellar)");
  assert.equal(formatPokemonName("charizard-mega-x"), "Charizard (Mega X)");
});

test("formatPokemonName: multi-word suffix is title-cased and space-joined", () => {
  assert.equal(formatPokemonName("necrozma-dusk-mane"), "Necrozma (Dusk Mane)");
});

test("formatPokemonName: empty or non-string input returns empty string", () => {
  assert.equal(formatPokemonName(""), "");
  assert.equal(formatPokemonName(undefined), "");
  assert.equal(formatPokemonName(null), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test js/format.test.js
```

Expected: FAIL — `Cannot find module './format.js'` (or similar module-not-found error).

- [ ] **Step 3: Write `js/format.js`**

```javascript
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * format.js - Pure text-formatting helpers for display
 */

function titleCaseWord(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Format a PokéAPI name/slug for display. A plain name is title-cased.
 * A hyphenated form name (e.g. "terapagos-stellar") splits into a
 * title-cased base species name plus a parenthesized, title-cased,
 * space-joined suffix: "Terapagos (Stellar)".
 * @param {string} name
 * @returns {string}
 */
export function formatPokemonName(name) {
  if (typeof name !== "string" || !name) return "";

  const [base, ...suffixParts] = name.split("-");
  const formattedBase = titleCaseWord(base);

  if (suffixParts.length === 0) return formattedBase;

  const formattedSuffix = suffixParts.map(titleCaseWord).join(" ");
  return `${formattedBase} (${formattedSuffix})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test js/format.test.js
```

Expected: PASS, all 4 tests green (0 failures).

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
node --test
```

Expected: all existing tests plus the 4 new ones pass (existing suite was 19 tests per prior session notes — new total is 23).

- [ ] **Step 6: Commit**

```bash
git add js/format.js js/format.test.js
git commit -m "Add formatPokemonName for title-cased, parenthesized form names"
```

---

## Task 4: Details panel — stacked name/dex-number, eyebrow labels, formatted names

**Files:**
- Modify: `js/ui.js:560-652` (`_renderDetails`)
- Modify: `js/ui.js:937-982` (`_createSuggestionItem`)
- Modify: `css/style.css:190-231` (`.pokemon-name`, `.pokemon-id`, add `.detail-eyebrow`)

**Interfaces:**
- Consumes: `formatPokemonName` from `js/format.js` (Task 3); `--font-heading`, `--font-body`, `--font-mono` CSS vars (Task 2).
- Produces: `.detail-eyebrow` CSS class usable by any future detail-panel section.

- [ ] **Step 1: Import `formatPokemonName` in `js/ui.js`**

Find the top of `js/ui.js` where other local modules are imported (e.g. `import { el, img } from "./dom.js";`) and add:

```javascript
import { formatPokemonName } from "./format.js";
```

- [ ] **Step 2: Split `.pokemon-name` into stacked name + dex-number lines**

In `_renderDetails`, find:

```javascript
    const speciesName = pokemon.species?.name || pokemon.name;
    const nameEl = el(
      "h3",
      { class: "pokemon-name" },
      el(
        "a",
        {
          class: "pokemon-name-link",
          href: `https://pokemondb.net/pokedex/${encodeURIComponent(speciesName)}`,
          target: "_blank",
          rel: "noopener noreferrer",
          title: `View ${pokemon.name} on PokémonDB`,
        },
        pokemon.name,
      ),
      el("span", { class: "pokemon-id" }, ` - ${pokemon.id}`),
    );
```

Replace with (renders the formatted display name inside the link, and the dex number as `N°025` on its own line below — matching the format already used in `_createSuggestionItem`, `js/ui.js:939`):

```javascript
    const speciesName = pokemon.species?.name || pokemon.name;
    const dexNumber = Number.isFinite(pokemon.id)
      ? `N°${String(pokemon.id).padStart(3, "0")}`
      : "";
    const nameEl = el(
      "h3",
      { class: "pokemon-name" },
      el(
        "a",
        {
          class: "pokemon-name-link",
          href: `https://pokemondb.net/pokedex/${encodeURIComponent(speciesName)}`,
          target: "_blank",
          rel: "noopener noreferrer",
          title: `View ${pokemon.name} on PokémonDB`,
        },
        formatPokemonName(pokemon.name),
      ),
      el("span", { class: "pokemon-id" }, dexNumber),
    );
```

- [ ] **Step 3: Replace inline `<strong>` labels with `.detail-eyebrow` spans**

Find:

```javascript
    const typesEl = el("p", { class: "pokemon-types" }, el("strong", {}, "Type: "), ...typeChips);
```

Replace with:

```javascript
    const typesEl = el(
      "div",
      { class: "pokemon-types" },
      el("span", { class: "detail-eyebrow" }, "Type"),
      el("div", { class: "detail-value" }, ...typeChips),
    );
```

Find:

```javascript
    const abilitiesEl = el(
      "p",
      { class: "pokemon-abilities" },
      el("strong", {}, "Abilities: "),
      this._getAbilitiesString(pokemon),
    );

    const movesEl = el(
      "p",
      { class: "pokemon-moves" },
      el("strong", {}, "Moves: "),
      this._getMovesString(pokemon),
    );
```

Replace with:

```javascript
    const abilitiesEl = el(
      "div",
      { class: "pokemon-abilities" },
      el("span", { class: "detail-eyebrow" }, "Abilities"),
      el("div", { class: "detail-value" }, this._getAbilitiesString(pokemon)),
    );

    const movesEl = el(
      "div",
      { class: "pokemon-moves" },
      el("span", { class: "detail-eyebrow" }, "Moves"),
      el("div", { class: "detail-value" }, this._getMovesString(pokemon)),
    );
```

Find:

```javascript
      const evolutionsEl = el(
        "p",
        { class: "pokemon-evolutions" },  // Remove the color class from parent
        el("strong", {}, "Evolutions: "),
      );
```

Replace with:

```javascript
      const evolutionsEl = el(
        "div",
        { class: "pokemon-evolutions" },
        el("span", { class: "detail-eyebrow" }, "Evolutions"),
      );
```

- [ ] **Step 4: Apply `formatPokemonName` to suggestion-list names**

In `_createSuggestionItem`, find:

```javascript
  _createSuggestionItem(item, onSelect) {
    const label = item.name || "";
```

Replace with:

```javascript
  _createSuggestionItem(item, onSelect) {
    const label = formatPokemonName(item.name || "");
```

Leave the rest of `_createSuggestionItem` unchanged — `label` is already used downstream for the button text, `aria-label`, `onSelect` payload, `setSearchValue` preview text, etc.; all of these should show the formatted name, so no other line needs to change. Confirm this by reading `js/ui.js:937-982` after the edit and checking `label` isn't reassigned or shadowed anywhere else in the function.

- [ ] **Step 5: Add `.detail-eyebrow` / `.detail-value` CSS and restyle `.pokemon-name` / `.pokemon-id`**

In `css/style.css`, find:

```css
/* Pokemon details styling */
.pokemon-name {
    font-size: 20px;
    text-transform: capitalize;
    margin: auto auto 0.5em;
    color: ivory;
}

.pokemon-id {
    margin: auto;
}

.pokemon-entry {
    font-size: 14px;
    margin: 0.5em auto;
}
```

Replace with:

```css
/* Pokemon details styling */
.pokemon-name {
    display: block;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 20px;
    text-transform: none;
    margin: 0 0 0.15em;
    color: ivory;
}

.pokemon-id {
    display: block;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-secondary);
    opacity: 0.7;
    letter-spacing: 0.5px;
    margin: 0 0 0.5em;
}

.pokemon-entry {
    font-family: var(--font-body);
    font-size: 14px;
    margin: 0.5em auto;
}

.detail-eyebrow {
    display: block;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--color-text-secondary);
    opacity: 0.7;
    margin-bottom: 0.2em;
}

.detail-value {
    font-family: var(--font-body);
}
```

Note: `.pokemon-name` was previously `text-transform: capitalize` (relying on raw lowercase API names being capitalized by CSS); it's now `text-transform: none` because `formatPokemonName` already produces correctly-cased text in JS, and `text-transform: capitalize` would incorrectly re-capitalize every word inside the parenthesized suffix in a way that's redundant but harmless — set to `none` for clarity that casing is JS-owned now.

- [ ] **Step 6: Manually verify no syntax errors and run full test suite**

```bash
node -e "require('fs').readFileSync('css/style.css','utf8')" && echo "css readable"
node --test
```

Expected: `css readable`, all tests pass (23 total from Task 3).

- [ ] **Step 7: Commit**

```bash
git add js/ui.js css/style.css
git commit -m "Stack name/dex-number, add eyebrow labels, format hyphenated names"
```

---

## Task 5: Cyan accent for suggestion-list hover/selected state

**Files:**
- Modify: `css/style.css:945-992` (`.suggestion-button` and related)

**Interfaces:**
- Consumes: `--color-accent` from Task 2.

- [ ] **Step 1: Recolor the suggestion-button hover, active, and focus states**

Find:

```css
.suggestion-button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 15px;
    text-align: left;
    border: none;
    border-left: 3px solid transparent;
    color: #d895da;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.15s ease, border-color 0.15s ease;
    white-space: nowrap;
    overflow: hidden;
    box-sizing: border-box;
    min-height: 40px; /* Ensure minimum touch-friendly size */
}
```

Replace `color: #d895da;` with an off-white so the accent color is reserved for the interactive-state signal rather than the resting text color (per spec: "list colors" migrate off the prior purple/yellow scheme):

```css
.suggestion-button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 15px;
    text-align: left;
    border: none;
    border-left: 3px solid transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 14px;
    font-family: var(--font-body);
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    white-space: nowrap;
    overflow: hidden;
    box-sizing: border-box;
    min-height: 40px; /* Ensure minimum touch-friendly size */
}
```

Find:

```css
.suggestion-button:hover {
    background-color: #3a3a3a;
}

.suggestion-button:active {
    background-color: #4a4a4a;
    transform: scale(0.98);
}

.suggestion-button:focus-visible {
    outline: none;
    border-left-color: #ffcb05;
    background-color: #3a331a;
}
```

Replace with (cyan accent for hover/active/focus, replacing the yellow focus treatment that's specific to *this in-screen list* — shell chrome `:focus-visible` elsewhere is untouched, per Global Constraints):

```css
.suggestion-button:hover {
    background-color: #3a3a3a;
    border-left-color: var(--color-accent);
    color: var(--color-text);
}

.suggestion-button:active {
    background-color: #4a4a4a;
    transform: scale(0.98);
}

.suggestion-button:focus-visible {
    outline: none;
    border-left-color: var(--color-accent);
    background-color: rgba(53, 194, 200, 0.15);
    color: var(--color-text);
}
```

- [ ] **Step 2: Update `.suggestion-dex` to use the mono font var**

Find:

```css
.suggestion-dex {
    flex: 0 0 auto;
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #888;
    letter-spacing: 0.5px;
}
```

Replace with:

```css
.suggestion-dex {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 12px;
    color: #888;
    letter-spacing: 0.5px;
}
```

- [ ] **Step 3: Manually verify no syntax errors**

```bash
node -e "require('fs').readFileSync('css/style.css','utf8')" && echo "css readable"
```

Expected: `css readable`.

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "Use cyan accent for suggestion-list hover/selected state"
```

---

## Task 6: Precache font files in the service worker

**Files:**
- Modify: `sw.js:9` (`VERSION`)
- Modify: `sw.js:18-30` (`STATIC_FILES`)

**Interfaces:**
- Consumes: `assets/fonts/*.woff2` paths from Task 1.

- [ ] **Step 1: Bump the cache version**

Find:

```javascript
const VERSION = "v10";
```

Replace with:

```javascript
const VERSION = "v11";
```

(Bumping the version is required so returning users' browsers evict the old shell cache and fetch the new CSS/JS/fonts on next load — matches the existing pattern for shell-affecting changes.)

- [ ] **Step 2: Add the four font files to `STATIC_FILES`**

Find:

```javascript
const STATIC_FILES = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/index.js",
  "/js/api.js",
  "/js/controller.js",
  "/js/dom.js",
  "/js/ui.js",
  "/js/search.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
```

Replace with (adds `js/format.js` since it's now a real module the app loads, and the four font files):

```javascript
const STATIC_FILES = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/index.js",
  "/js/api.js",
  "/js/controller.js",
  "/js/dom.js",
  "/js/ui.js",
  "/js/search.js",
  "/js/format.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/assets/fonts/outfit-700.woff2",
  "/assets/fonts/inter-400.woff2",
  "/assets/fonts/inter-500.woff2",
  "/assets/fonts/jetbrains-mono-400.woff2",
];
```

- [ ] **Step 3: Manually verify no syntax errors**

```bash
node -e "require('fs').readFileSync('sw.js','utf8')" && echo "sw.js readable"
node --check sw.js 2>&1 || node -e "new Function(require('fs').readFileSync('sw.js','utf8'))" && echo "syntax ok"
```

Expected: both checks succeed without throwing.

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "Precache self-hosted fonts and format.js in the service worker"
```

---

## Task 7: Browser verification

**Files:** None modified — verification only.

- [ ] **Step 1: Start a local static server on the feature branch**

```bash
git branch --show-current
python3 -m http.server 8090
```

Expected: branch is `modern-ui-redesign` (or whatever branch these commits landed on); server starts without error.

- [ ] **Step 2: Load the app in a browser via chrome-devtools MCP and clear old state**

Navigate to `http://localhost:8090/`, open DevTools Application panel (or use the MCP tools), unregister any existing service worker and clear caches for this origin, then hard-reload (`ignoreCache: true`) so the new `sw.js` v11 and new assets are actually fetched rather than served from a stale v10 cache.

- [ ] **Step 3: Verify no console errors and no CSP violations**

Check the browser console for errors — specifically confirm there are no `Refused to load the font` CSP violation messages (would indicate a font `src` pointing off-origin) and no 404s for `/assets/fonts/*.woff2`.

- [ ] **Step 4: Verify visual changes are present**

Confirm: title reads "POKÉDEX" in Outfit with no glow; a Pokémon's name/dex-number are on two separate lines (name above, `N°025`-style mono below); Type/Abilities/Moves/Evolutions show as small uppercase eyebrow labels above their values (no more inline "Type: " bold prefix); a Pokémon with a hyphenated form (e.g. search for `terapagos-stellar` or `charizard-mega-x` if present in the dataset) shows a parenthesized suffix like "Terapagos (Stellar)"; hovering/focusing a suggestion-list row shows a cyan left-bar instead of yellow; D-pad/camera-lens/yellow-button keyboard focus still shows the yellow outline (unchanged).

- [ ] **Step 5: Verify offline/precache behavior**

In DevTools Application > Service Workers, confirm the `pokedex-shell-v11` cache contains the four font files and `js/format.js`. Optionally toggle "Offline" in the Network tab and reload — the app should still load correctly.

- [ ] **Step 6: Report findings**

Note in the conversation whether all checks passed or if any issue was found (broken font load, layout shift, missed selector, etc.) — do not silently patch and re-verify without surfacing what was wrong.

---

## Self-Review Notes

- **Spec coverage:** All five spec sections (Fonts, Color/accent, Details panel, Testing, Out-of-scope) map to tasks 1-2 (fonts), 2 & 5 (color/accent), 3-4 (details panel: format.js + eyebrow labels + stacked name), 6-7 (precache + verification). Out-of-scope items (sprite dithering, layout restructuring, D-pad/shell focus color) are explicitly called out as untouched in Global Constraints and Task 5 Step 1's comment, so no task accidentally does them.
- **Placeholder scan:** The only bracketed placeholders are in Task 1 Step 2 (`<INTER_400_URL_FROM_STEP_1>` etc.) — these are intentional, since Google Fonts CSS2 response URLs are versioned/rotate and can't be hardcoded reliably; Step 1 has the engineer extract them fresh immediately before use, which is a real, executable action, not a deferred TODO.
- **Type consistency:** `formatPokemonName(name: string): string` signature (Task 3) matches its two call sites (Task 4 Steps 2 and 4) — both pass a string and use the string return value directly, no other shape is assumed anywhere.
