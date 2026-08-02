# Redundancy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified redundancy (duplicated logic, hardcoded literals that already have a token, dead CSS declarations) surfaced by a 4-agent parallel audit of the Pokédex PWA, without changing any observable behavior.

**Architecture:** This is a pure-refactor plan — no new features, no behavior changes. Each task extracts an existing repeated pattern into one shared definition and updates every call site to use it. Every task must leave `node --test` green and leave the rendered page visually and functionally identical.

**Tech Stack:** Vanilla JavaScript (ES modules, no build step, no bundler), vanilla CSS (no preprocessor), `node --test` for the test suite (`js/*.test.js`).

## Global Constraints

- No build step exists and none may be introduced. All JS files are loaded natively via `<script type="module">` / ES `import`; all CSS is one plain file (`css/style.css`) with no preprocessor.
- No behavior change is permitted in any task. If a task's diff changes rendered output, computed values, or control flow in any way other than "same result, less duplication," that is a defect, not an improvement.
- Run `node --test` after every task. All existing tests (30 at plan start: `js/api.test.js`, `js/format.test.js`, `js/search.test.js`) must stay green. Do not delete or weaken a test to make it pass.
- Do not add commented-out code, TODOs, or placeholder implementations.
- Do not add an AI-attribution trailer (e.g. "Co-Authored-By") to any commit message. This is a standing project convention — commits in this repo never carry one.
- Each task is committed independently (its own commit), in the order given below, since later tasks in the JS group depend on earlier ones (Task 2 uses `isAbort`'s existing import, Task 4 depends on nothing else). CSS tasks (5-6) are independent of the JS tasks (1-4) and of each other, but keep the given order for a clean, reviewable history.
- Every code snippet below is the exact, complete code to write — not an illustration. Copy it verbatim, adjusting only surrounding whitespace/indentation to match the file's existing style if your editor reformats it.

---

## Task 1: Extract `capitalize()` helper in format.js

**Files:**
- Modify: `js/format.js:28-33` (the `titleCaseHyphenated` helper), `js/format.js:59-62` (inside `formatPokemonName`'s suffix formatting), `js/format.js:74-79` (`formatSlugName`)
- Test: `js/format.test.js` (existing tests must still pass unmodified — this task does not add new test cases, since `capitalize` is a private helper with no new observable behavior)

**Interfaces:**
- Produces: a private (non-exported) `capitalize(word)` function in `js/format.js`, returning `word.charAt(0).toUpperCase() + word.slice(1)`. Not exported — it's an internal helper used only within this file, exactly like `titleCaseHyphenated` already is.

**Context:** `js/format.js` currently repeats the exact expression `word.charAt(0).toUpperCase() + word.slice(1)` (or `part.charAt(0)...`) in three separate `.map()` callbacks: once in `titleCaseHyphenated`, once in `formatPokemonName`'s suffix-formatting block, and once in `formatSlugName`. This is the same primitive operation (capitalize the first letter of a word) written three times in an 80-line file.

Current file content (for reference — do not paste this as a diff, read the live file and edit it):

```js
// SPDX-License-Identifier: GPL-3.0-or-later

// Species whose own name contains a hyphen — without this list, splitting on
// the first hyphen would misparse them as a base + form suffix (e.g.
// "ho-oh" -> "Ho (Oh)" instead of "Ho-Oh").
const HYPHENATED_BASE_SLUGS = [
  "ho-oh",
  "porygon-z",
  "mime-jr",
  "mr-mime",
  "mr-rime",
  "type-null",
  "jangmo-o",
  "hakamo-o",
  "kommo-o",
  "tapu-koko",
  "tapu-lele",
  "tapu-bulu",
  "tapu-fini",
  "wo-chien",
  "chien-pao",
  "ting-lu",
  "chi-yu",
  "nidoran-f",
  "nidoran-m",
];

function titleCaseHyphenated(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

export function formatPokemonName(name) {
  // Handle empty, null, or non-string input
  if (!name || typeof name !== "string") {
    return "";
  }

  const lower = name.toLowerCase();
  const matchedBase = HYPHENATED_BASE_SLUGS.find(
    (slug) => lower === slug || lower.startsWith(`${slug}-`),
  );

  const baseSlug = matchedBase || name.split("-")[0];
  const suffixSlug = matchedBase
    ? lower.slice(matchedBase.length + 1)
    : name.split("-").slice(1).join("-");

  const base = titleCaseHyphenated(baseSlug);

  // If there's no suffix, return just the title-cased base
  if (!suffixSlug) {
    return base;
  }

  // Title-case each part of the suffix and join with spaces
  const suffix = suffixSlug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return `${base} (${suffix})`;
}

export function formatDexNumber(id) {
  return Number.isFinite(id) ? `N°${String(id).padStart(3, "0")}` : "";
}

// Formats an ability/move API slug ("swift-swim") as space-separated title
// case ("Swift Swim") — unlike species names, every hyphen here is just a
// word separator, so no base/suffix splitting is needed.
export function formatSlugName(slug) {
  if (!slug || typeof slug !== "string") return "";
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
```

- [ ] **Step 1: Add the `capitalize` helper and use it in `titleCaseHyphenated`**

Add this function immediately above `titleCaseHyphenated`, then rewrite `titleCaseHyphenated` to use it:

```js
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function titleCaseHyphenated(slug) {
  return slug.split("-").map(capitalize).join("-");
}
```

- [ ] **Step 2: Use `capitalize` in `formatPokemonName`'s suffix formatting**

Replace:
```js
  const suffix = suffixSlug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
```
with:
```js
  const suffix = suffixSlug.split("-").map(capitalize).join(" ");
```

- [ ] **Step 3: Use `capitalize` in `formatSlugName`**

Replace:
```js
export function formatSlugName(slug) {
  if (!slug || typeof slug !== "string") return "";
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
```
with:
```js
export function formatSlugName(slug) {
  if (!slug || typeof slug !== "string") return "";
  return slug.split("-").map(capitalize).join(" ");
}
```

- [ ] **Step 4: Run the full test suite**

Run: `node --test`
Expected: all 30 existing tests pass (0 failures). `format.test.js`'s tests for `formatPokemonName`, `formatDexNumber`, and `formatSlugName` all still pass unmodified, since this is a pure internal refactor with no change to any function's observable input/output behavior.

- [ ] **Step 5: Commit**

```bash
git add js/format.js
git commit -m "Extract capitalize() helper to dedupe title-casing in format.js"
```

---

## Task 2: Extract `reportError()` helper for AbortError-swallowing catch blocks in controller.js

**Files:**
- Modify: `js/controller.js` (add one new private method; update catch blocks at approximately lines 180-186, 220-227, 260-266, 310-319, 350-359, 363-367, 405-411, 435-442 — exact line numbers below are from the plan's own audit and may shift slightly if earlier tasks touched this file, which they don't; verify each site with the code excerpts given, not the line number alone)

**Interfaces:**
- Consumes: `isAbort(err)` already imported from `./api.js` at `js/controller.js:7` — no import change needed.
- Produces: a new private instance method `_reportError(err, { fallback, ui } = {})` on `PokedexController`, used by later tasks/call sites in this same file. Signature: `_reportError(err, { logPrefix, uiMessage } = {})`. Behavior: if `isAbort(err)`, do nothing (swallow silently — the caller decides separately whether to re-throw). Otherwise: `console.error(logPrefix, err)`, and if `uiMessage` is provided, call the matching `this.ui` method (see per-site mapping below — different sites call `showError`, `showNotice`, or neither).

**Context:** `js/controller.js` has 7 catch blocks that all follow the same "swallow AbortError, otherwise log (and sometimes show a UI message)" shape. Read the full current file to find and confirm each site before editing — do not blind-replace by line number, since the plan's line numbers are a guide, not gospel. Use `grep -n "isAbort\|AbortError" js/controller.js` to enumerate the exact current sites first.

The 7 sites, by their current shape (confirm each against the live file — do not assume the code shown here is verbatim if the file has drifted):

1. **`loadStarterPokemon` catch** (~line 180-187): logs to console AND calls both `this.ui.showError(...)` and `this.ui.showNotice(...)`. This site has TWO ui calls — do not try to force it through a single-`uiMessage` helper call; leave this site's catch body as free-form code but still gate it with `if (!isAbort(err)) { ... }` using the existing pattern (this site is the one exception — do not change its internals beyond what's already there, since it calls two different UI methods and forcing it into `_reportError`'s single-`uiMessage` shape would require widening the helper's interface for one caller. Skip converting this specific site; leave it exactly as it is today.)
2. **A catch block around line 220-227** that does `console.error("Failed to fetch starter Pokémon:", err);` conditionally — confirm exact wrapping `if`/context before editing.
3. **A catch block around line 260-266**: `console.error("Could not load the Pokédex list:", err);` guarded by `if (!isAbort(err))`.
4. **A catch block around line 310-319** (inside `progressivelyLoadPokemonList`): `console.error("Error loading pokemon list progressively:", err);` guarded by `if (!isAbort(err))` — no UI call (this is the "fail silently" path documented in a comment above it; keep that comment).
5. **A catch block around line 350-359** (nested inside `fetchPokemonById`'s enrichment `.catch()`): `console.error("Failed to load Pokemon details:", err); base.speciesLoadFailed = true;` followed by conditional `this.ui.updatePokemonDetails(base)` — this site has extra logic beyond a simple report (sets `speciesLoadFailed`, conditionally re-renders), so like site 1, do NOT force this one through `_reportError`. Leave it as-is.
6. **A catch block around line 363-367**: `if (isAbort(err)) throw err;` (the inverted form — re-throws on abort instead of swallowing) followed by `this.ui.showError(...)` and `this.ui.clearMainScreen()`. This is the inverted-condition variant; `_reportError` as specified only handles the swallow case, not the re-throw case, so this site is NOT a candidate for the new helper either — leave it as-is.
7. **A catch block around line 405-411**: `console.error(\`Error fetching Pokemon data for ${idOrName}:\`, err);` guarded by `if (!isAbort(err))`, no UI call, then re-throws (`throw err;`) unconditionally after the guard block.
8. **A catch block around line 435-442** (in `selectPokemonByName`): `if (!isAbort(err)) { console.error(...); this.ui.showError(...); }`.

Given the above, only sites 2, 3, 4, 7, and 8 are genuinely "log-only or log+one-UI-call, no other side effects" shapes that safely collapse into `_reportError`. Sites 1, 5, and 6 have extra logic (multiple UI calls, state mutation, or re-throw-on-abort instead of swallow-on-abort) and MUST be left unchanged — converting them would either lose behavior or force `_reportError`'s interface to grow bespoke flags for a single caller each, which is not a net simplification.

- [ ] **Step 1: Add the `_reportError` method**

Add this as a new method on the `PokedexController` class (place it near the top of the class body, e.g. directly after the `init()` method, so it reads as a general-purpose utility other methods call):

```js
  /**
   * Swallows AbortError silently; otherwise logs and optionally shows a UI message.
   */
  _reportError(err, { logPrefix, uiMessage } = {}) {
    if (isAbort(err)) return;
    console.error(logPrefix, err);
    if (uiMessage) this.ui.showError(uiMessage);
  }
```

- [ ] **Step 2: Convert site 2 (~line 220-227, starter Pokémon fetch failure)**

Find the exact current code with `grep -n -A3 "Failed to fetch starter" js/controller.js`. It guards `console.error("Failed to fetch starter Pokémon:", err);` with `if (!isAbort(err))`. Confirm whether this site also has a UI call adjacent to it (per the audit note above, site 1 nearby has two UI calls — make sure you are editing the console.error-only site, not that one). If this specific catch body is ONLY the guarded `console.error` with no UI call, replace the guard+log with:

```js
this._reportError(err, { logPrefix: "Failed to fetch starter Pokémon:" });
```

If on inspection this site turns out to have a UI call too (i.e. it's actually the same site as #1 in the audit numbering above and the line numbers just drifted), do not convert it — leave it unchanged and note this in your report.

- [ ] **Step 3: Convert site 3 (~line 260-266, Pokédex list load failure)**

Find with `grep -n -A3 "Could not load the Pokédex list" js/controller.js`. Replace the `if (!isAbort(err)) { console.error("Could not load the Pokédex list:", err); }` block with:

```js
this._reportError(err, { logPrefix: "Could not load the Pokédex list:" });
```

- [ ] **Step 4: Convert site 4 (~line 310-319, progressive list load — fail silently)**

Find with `grep -n -B2 -A4 "Error loading pokemon list progressively" js/controller.js`. This site has an explanatory comment above the catch (something like "Both callers of this method already want to fail silently... don't show an error banner here, just log it.") — KEEP that comment, only replace the `if (!isAbort(err)) { console.error(...); }` body with:

```js
this._reportError(err, { logPrefix: "Error loading pokemon list progressively:" });
```

- [ ] **Step 5: Convert site 7 (~line 405-411, fetch Pokemon data by id/name)**

Find with `grep -n -B2 -A4 "Error fetching Pokemon data for" js/controller.js`. This site guards a `console.error` with a template literal message, then unconditionally re-throws afterward (`throw err;` outside/after the guard). Replace only the guarded log line:

```js
// before (illustrative — confirm exact current text):
if (!isAbort(err)) {
  console.error(`Error fetching Pokemon data for ${idOrName}:`, err);
}
throw err;

// after:
this._reportError(err, { logPrefix: `Error fetching Pokemon data for ${idOrName}:` });
throw err;
```

Keep the unconditional `throw err;` exactly as it is — `_reportError` never throws, so the re-throw must remain a separate statement immediately after the call.

- [ ] **Step 6: Convert site 8 (~line 435-442, `selectPokemonByName`)**

Find with `grep -n -A6 "selectPokemonByName" js/controller.js`. Replace:

```js
this.fetchPokemonById(id, { keepScreen: true }).catch((err) => {
  if (!isAbort(err)) {
    console.error(/* whatever the existing log line/message is */);
    this.ui.showError(`Error loading ${name}.`);
  }
});
```
with:
```js
this.fetchPokemonById(id, { keepScreen: true }).catch((err) => {
  this._reportError(err, {
    logPrefix: `Error loading ${name}:`,
    uiMessage: `Error loading ${name}.`,
  });
});
```

Confirm the exact original log message text before replacing `logPrefix` — preserve whatever string/format the original `console.error` used at this site (don't invent new wording if the original differs from the illustrative text above).

- [ ] **Step 7: Run the full test suite**

Run: `node --test`
Expected: all 30 tests pass. (Note: no existing test directly exercises `PokedexController`'s catch blocks — this is a browser-integration class with no unit tests in this suite — so passing tests here confirms nothing broke in `api.js`/`format.js`/`search.js`, which is expected. Also load the app in a browser per Step 8.)

- [ ] **Step 8: Manual smoke check**

Since no automated test covers `PokedexController` directly, verify by hand: start a static server (`python3 -m http.server 8080` or equivalent) or open `index.html` directly, open the Pokédex, and confirm:
- Normal Pokémon load/search still works (no console errors on the happy path).
- Rapidly typing/overtyping a search query still behaves the same as before (no new console errors from aborted requests — AbortErrors should stay silent, not logged).

- [ ] **Step 9: Commit**

```bash
git add js/controller.js
git commit -m "Extract _reportError() helper to dedupe AbortError-swallowing catch blocks"
```

---

## Task 3: Extract `_idForName()` accessor in controller.js

**Files:**
- Modify: `js/controller.js` (add one private method; update the 3-4 inline `pokemonNameMap.get(...)` lookups)

**Interfaces:**
- Consumes: `this.state.pokemonNameMap` (existing `Map<string, number>` keyed by lowercase name).
- Produces: a private method `_idForName(name)` returning `this.state.pokemonNameMap.get(String(name).toLowerCase())`. Used by this task's own call-site updates.

**Context:** `js/controller.js` inlines `this.state.pokemonNameMap.get(...)` with ad-hoc lowercasing (`name.toLowerCase()` or `String(x).toLowerCase()`) at multiple call sites instead of going through one accessor. Find every current call site with:

```bash
grep -n "pokemonNameMap.get" js/controller.js
```

There will be 3-5 matches (exact count depends on current file state — the audit found 3-4, confirm against the live file). For each match that reads an id FOR a given name (i.e. excludes any site that is *building*/populating the map, e.g. `pokemonNameMap.set(...)`, which must NOT be touched by this task), replace the inline `.get(...lowercase-expr...)` call with `this._idForName(...)`.

- [ ] **Step 1: Add the `_idForName` method**

Add near `_reportError` (same general-utilities area of the class):

```js
  _idForName(name) {
    return this.state.pokemonNameMap.get(String(name).toLowerCase());
  }
```

- [ ] **Step 2: Replace each read-site**

For each `grep` match found in the Context section above that is a `.get(...)` read (not a `.set(...)` write), replace the full expression with a call to `this._idForName(name)`, passing whatever the original name expression was. For example, if a site reads:

```js
const id = this.state.pokemonNameMap.get(String(name).toLowerCase());
```
replace with:
```js
const id = this._idForName(name);
```

And if a site reads (query already lowercased earlier in the same function, e.g. in `_performSearch`):
```js
const exactMatch = this.state.pokemonNameMap.get(query);
```
where `query` is already `raw.toLowerCase()` from earlier in the function — this is still a valid `_idForName` call since `_idForName` re-lowercases internally (lowercasing an already-lowercase string is a no-op), so replace with:
```js
const exactMatch = this._idForName(query);
```

And for the site inside `renderSearchSuggestions`:
```js
const singleMatchId = this.state.pokemonNameMap.get(allMatches[0]);
```
replace with:
```js
const singleMatchId = this._idForName(allMatches[0]);
```

Do this for every genuine read-site found by the grep in Step 2's context — do not skip any, and do not touch any `.set(` call (map population must stay as direct `Map` calls, since `_idForName` is read-only by design).

- [ ] **Step 3: Run the full test suite**

Run: `node --test`
Expected: all 30 tests pass.

- [ ] **Step 4: Manual smoke check**

Search by exact name, search by partial/fuzzy name with a single match, and click a Pokémon in the suggestions list — confirm all three still resolve to the correct Pokémon (no regression in name-to-id resolution).

- [ ] **Step 5: Commit**

```bash
git add js/controller.js
git commit -m "Extract _idForName() accessor to dedupe pokemonNameMap lookups"
```

---

## Task 4: Export `LAST_ID_KEY` constant from api.js, use in controller.js

**Files:**
- Modify: `js/api.js:19-20` (alongside the existing `NAME_LIST_KEY`/`NAME_LIST_TTL` exports)
- Modify: `js/controller.js:7` (import line), and the two sites currently hardcoding `"pokedex_last_id"` (confirmed present at the time of this audit — re-confirm exact line numbers with `grep -n "pokedex_last_id" js/controller.js` before editing, since Tasks 2-3 may have shifted line numbers in this file)

**Interfaces:**
- Produces: `export const LAST_ID_KEY = "pokedex_last_id";` in `js/api.js`, immediately after the existing `NAME_LIST_TTL` export. Consumed by `js/controller.js` at both of its `StorageHelper.loadRaw(...)`/`StorageHelper.saveRaw(...)` call sites for this key.

**Context:** `js/api.js:19` already exports `NAME_LIST_KEY = "pokedex_name_list_v1"` as a shared constant for a different localStorage key, but the `"pokedex_last_id"` key used elsewhere is hardcoded as a raw string literal in two places in `controller.js` instead of following the same pattern. This is a magic-string duplication with real drift risk (a typo in one of the two sites would silently break persistence).

Current `js/api.js` lines 13-20 (for reference):
```js
const API_BASE_URL = "https://pokeapi.co/api/v2";
const MIN_REQUEST_INTERVAL = 50;
export const SEARCH_DEBOUNCE_MS = 120;
export const PRELOAD_MAX_ADJACENT = 3;
const CACHE_EXPIRATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX_SIZE = 300;
export const NAME_LIST_KEY = "pokedex_name_list_v1";
export const NAME_LIST_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
```

- [ ] **Step 1: Add the new export to `js/api.js`**

Replace:
```js
export const NAME_LIST_KEY = "pokedex_name_list_v1";
export const NAME_LIST_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
```
with:
```js
export const NAME_LIST_KEY = "pokedex_name_list_v1";
export const NAME_LIST_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
export const LAST_ID_KEY = "pokedex_last_id";
```

- [ ] **Step 2: Update the import in `js/controller.js`**

Find the current import line (line 7 at time of writing — re-confirm with `grep -n "from \"./api.js\"" js/controller.js`):
```js
import { PokemonAPI, Cache, StorageHelper, spriteUrl, isAbort, SEARCH_DEBOUNCE_MS, PRELOAD_MAX_ADJACENT, NAME_LIST_KEY, NAME_LIST_TTL } from "./api.js";
```
Add `LAST_ID_KEY` to the named imports:
```js
import { PokemonAPI, Cache, StorageHelper, spriteUrl, isAbort, SEARCH_DEBOUNCE_MS, PRELOAD_MAX_ADJACENT, NAME_LIST_KEY, NAME_LIST_TTL, LAST_ID_KEY } from "./api.js";
```

- [ ] **Step 3: Replace both hardcoded string sites**

Run `grep -n '"pokedex_last_id"' js/controller.js` to find both current sites. Replace:
```js
StorageHelper.loadRaw("pokedex_last_id")
```
with:
```js
StorageHelper.loadRaw(LAST_ID_KEY)
```
and:
```js
StorageHelper.saveRaw("pokedex_last_id", base.id);
```
with:
```js
StorageHelper.saveRaw(LAST_ID_KEY, base.id);
```

- [ ] **Step 4: Run the full test suite**

Run: `node --test`
Expected: all 30 tests pass.

- [ ] **Step 5: Manual smoke check**

Load a Pokémon, reload the page — confirm the same Pokémon is restored on reload (this exercises both the save and load sites for this key).

- [ ] **Step 6: Commit**

```bash
git add js/api.js js/controller.js
git commit -m "Export LAST_ID_KEY constant instead of duplicating the localStorage key string"
```

---

## Task 5: Add `--color-panel-dark`/`--color-border-muted` CSS variables, replace raw literals

**Files:**
- Modify: `css/style.css:35-70` (the `:root` block, to add two new variables) and every site listed below that currently hardcodes `#222` or `#444`

**Interfaces:**
- Produces: two new CSS custom properties in `:root`: `--color-panel-dark: #222;` and `--color-border-muted: #444;`. Consumed by every site below in this same task.

**Context:** `css/style.css`'s `:root` block already defines themed tokens for every other repeated color (`--color-pokedex`, `--color-shadow-yellow`, etc.), but `#222` (dark panel background, used 6×) and `#444` (muted border, used 8×) are hardcoded as raw literals everywhere they appear, with no corresponding variable. Confirm every site with:

```bash
grep -n "#222\|#444" css/style.css
```

Do NOT touch any hex literal that is not exactly `#222` or exactly `#444` (e.g. leave `#111`, `#333`, `#1a1a1a`, `#666` untouched — those are distinct values used elsewhere and are out of scope for this task; merging them would be a visual change, not a pure dedup).

- [ ] **Step 1: Add the two new variables to `:root`**

Find the current `:root` block (starts at `css/style.css:35`). Locate this section within it:
```css
    --color-shadow-yellow: rgba(255, 204, 0, 0.7);
    --color-shadow-yellow-soft: rgba(255, 204, 0, 0.4);
    --color-accent: #35c2c8;
    /* Common values */
    --border-radius-standard: 5px;
    --box-shadow-standard: 0 5px 10px rgba(0, 0, 0, 0.3);
```
Replace it with:
```css
    --color-shadow-yellow: rgba(255, 204, 0, 0.7);
    --color-shadow-yellow-soft: rgba(255, 204, 0, 0.4);
    --color-accent: #35c2c8;
    --color-panel-dark: #222;
    --color-border-muted: #444;
    /* Common values */
    --border-radius-standard: 5px;
    --box-shadow-standard: 0 5px 10px rgba(0, 0, 0, 0.3);
```

- [ ] **Step 2: Replace every `#222` site (except inside the `:root` block itself)**

For each of the following properties currently using `#222` as a literal value (confirm exact current line numbers with the grep from the Context section — these are the values audited at plan-writing time), replace the literal with `var(--color-panel-dark)`:

- `.spine { background-color: #222; }` → `background-color: var(--color-panel-dark);`
- `.main-screen { border: 3px solid #222; }` → `border: 3px solid var(--color-panel-dark);`
- `.pokemon-search-input { background-color: #222; }` → `background-color: var(--color-panel-dark);`
- `.pokemon-search-button { background-color: #222; }` → `background-color: var(--color-panel-dark);`
- `.pokemon-details-area { scrollbar-color: #444 #222; }` → `scrollbar-color: var(--color-border-muted) var(--color-panel-dark);` (this line has BOTH colors — handle it once, converting both halves; do not create a duplicate entry for it when you get to the `#444` pass below)
- `.pokemon-details-area::-webkit-scrollbar-track { background: #222; }` → `background: var(--color-panel-dark);`
- `.d-pad { background-color: #222; }` → `background-color: var(--color-panel-dark);`

- [ ] **Step 3: Replace every remaining `#444` site**

(The `scrollbar-color` line was already handled in Step 2 — skip it here.) For each remaining site:

- `.pokemon-search-input { border: 1px solid #444; }` → `border: 1px solid var(--color-border-muted);`
- `.pokemon-search-button { border: 1px solid #444; }` → `border: 1px solid var(--color-border-muted);`
- `.pokemon-details-area::-webkit-scrollbar-thumb { background: #444; }` → `background: var(--color-border-muted);`
- `.d-pad-up, .d-pad-right, .d-pad-down, .d-pad-left, .d-pad-center { border: 1px solid #444; }` → `border: 1px solid var(--color-border-muted);`
- `.blue-button-grid`'s center-area rule (`background-color: #444;` near `grid-area: center;`) → `background-color: var(--color-border-muted);`
- `.shortcuts-modal { border: 2px solid #444; }` → `border: 2px solid var(--color-border-muted);`
- `.shortcuts-header { border-bottom: 1px solid #444; }` → `border-bottom: 1px solid var(--color-border-muted);`

After this step, `grep -n "#222\|#444" css/style.css` should return exactly ONE match: the `--color-panel-dark: #222;` and `--color-border-muted: #444;` definitions inside `:root` themselves (two lines, both containing the defining declaration, not a consuming site).

- [ ] **Step 4: Verify no other `#222`/`#444` sites remain outside `:root`**

Run: `grep -n "#222\|#444" css/style.css`
Expected output: exactly the two `:root` definition lines added in Step 1, nothing else.

- [ ] **Step 5: Run the full test suite**

Run: `node --test`
Expected: all 30 tests pass (CSS changes don't affect JS tests, but this confirms nothing else broke/no stray syntax errors crept into other files touched this session).

- [ ] **Step 6: Manual visual check**

Load the page in a browser and visually compare against the current deployed/previous screenshot (or your own memory of the UI): dark panel backgrounds (search input/button, D-pad, scrollbar track, shortcuts modal) and muted borders should look pixel-identical, since `var(--color-panel-dark)` resolves to the exact same `#222` value as before, and same for `--color-border-muted`/`#444`. This is a token-only substitution with zero visual change if done correctly.

- [ ] **Step 7: Commit**

```bash
git add css/style.css
git commit -m "Add --color-panel-dark/--color-border-muted variables, replace hardcoded #222/#444"
```

---

## Task 6: Merge duplicate `.pokemon-types` block, fix hardcoded border-radius, delete dead transition line

**Files:**
- Modify: `css/style.css` — three independent small fixes in one commit (all trivial, all in the same file, none touches JS)

**Interfaces:** None — pure CSS cleanup, no new tokens or JS-facing interfaces.

**Context:** Three separate, unrelated-but-small CSS redundancies confirmed by the audit, all safe to land together as one task since each is a single, independently-verifiable, zero-risk change:

1. `.pokemon-types` (currently its own block around `css/style.css:307-313`) has an identical property set to the existing `.pokemon-abilities, .pokemon-moves, .pokemon-evolutions` comma-selector list (around `css/style.css:318-324`) — `font-family: var(--font-body); font-size: 11px; line-height: 1.3; margin: 0.3em auto; text-transform: capitalize;` verbatim in both. `.pokemon-types` has one additional adjacent rule, `.pokemon-types .detail-eyebrow { display: inline; margin-right: 0.4em; }`, which is NOT duplicated anywhere and must be preserved as its own separate rule.
2. `.pokemon-search-button`'s `border-radius: 0 5px 5px 0;` (around `css/style.css:624`) hardcodes `5px` instead of using the already-defined `--border-radius-standard` variable (`css/style.css:67`), which every sibling site (e.g. `.pokemon-search-input`'s `border-radius: var(--border-radius-standard) 0 0 var(--border-radius-standard);`) already uses.
3. `.blue-button { transition: all 0.2s ease; }` (around `css/style.css:794`, inside the `.blue-button` rule block) is fully redundant: `.blue-button` is already included in the shared comma-selector transition list around `css/style.css:905-914` (`.pokemon-image, .pokemon-search-input, .pokemon-search-button, .type-chip, .suggestion-button, .d-pad > div, .blue-button, .yellow-button, .camera-lens { transition: all 0.2s ease; }`), with the identical property and value. The line-794 declaration inside `.blue-button`'s own block does nothing that the shared rule doesn't already do (same specificity — both are plain class selectors with no additional specificity weight, and both set the exact same value, so the later-cascading one wins with no visible difference either way; deleting the block-794 copy is a true no-op).

- [ ] **Step 1: Merge `.pokemon-types` into the shared selector list**

Confirm current exact content with `grep -n -B1 -A8 "^\.pokemon-types {" css/style.css`. You should see:
```css
.pokemon-types {
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.3;
    margin: 0.3em auto;
    text-transform: capitalize;
}
.pokemon-types .detail-eyebrow {
    display: inline;
    margin-right: 0.4em;
}
```
immediately followed later (not necessarily adjacent) by:
```css
.pokemon-abilities,
.pokemon-moves,
.pokemon-evolutions {
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.3;
    margin: 0.3em auto;
    text-transform: capitalize;
}
```

Delete the standalone `.pokemon-types { ... }` block entirely (5 property lines + selector + closing brace), but KEEP `.pokemon-types .detail-eyebrow { ... }` exactly where it is (it has no duplicate elsewhere). Then change the selector list it duplicated from:
```css
.pokemon-abilities,
.pokemon-moves,
.pokemon-evolutions {
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.3;
    margin: 0.3em auto;
    text-transform: capitalize;
}
```
to:
```css
.pokemon-types,
.pokemon-abilities,
.pokemon-moves,
.pokemon-evolutions {
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.3;
    margin: 0.3em auto;
    text-transform: capitalize;
}
```

Net effect: `.pokemon-types` now gets its properties via the shared list instead of its own block; `.pokemon-types .detail-eyebrow` is untouched; total rule count for this property set drops from 2 blocks to 1.

- [ ] **Step 2: Fix hardcoded border-radius on `.pokemon-search-button`**

Confirm with `grep -n "border-radius: 0 5px 5px 0;" css/style.css`. Replace:
```css
    border-radius: 0 5px 5px 0;
```
with:
```css
    border-radius: 0 var(--border-radius-standard) var(--border-radius-standard) 0;
```
(inside the `.pokemon-search-button` rule block — confirm you're editing the right occurrence if `grep` returns more than one match; there should be exactly one).

- [ ] **Step 3: Delete the dead `.blue-button` transition line**

Confirm with `grep -n -B6 -A2 "^\.blue-button {" css/style.css` that the block currently reads:
```css
.blue-button {
    height: 30px;
    background: linear-gradient(to bottom, #3498db, #2980b9);
    border: none;
    border-radius: var(--border-radius-standard);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    transition: all 0.2s ease;
    touch-action: manipulation;
}
```
and confirm separately with `grep -n -B8 "^    transition: all 0.2s ease;" css/style.css | grep -B8 "blue-button"` (or simply re-read the block around line 905-914 found earlier) that `.blue-button` is indeed already listed in the shared transition selector group. Once both are confirmed, delete only the `transition: all 0.2s ease;` line from inside `.blue-button`'s own block, leaving:
```css
.blue-button {
    height: 30px;
    background: linear-gradient(to bottom, #3498db, #2980b9);
    border: none;
    border-radius: var(--border-radius-standard);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    touch-action: manipulation;
}
```

- [ ] **Step 4: Run the full test suite**

Run: `node --test`
Expected: all 30 tests pass.

- [ ] **Step 5: Manual visual check**

Load the page: confirm the Type row still renders identically (same font, size, spacing, capitalize behavior as Abilities/Moves/Evolutions, which it already visually matched before this change — this task only removes the duplicate CSS source, not the visual result). Confirm the search button's right-side corners are still rounded exactly as before (visually identical, since `var(--border-radius-standard)` is `5px`, the exact value that was hardcoded). Confirm blue number-pad buttons still transition smoothly on hover/press (unaffected, since the shared rule still applies).

- [ ] **Step 6: Commit**

```bash
git add css/style.css
git commit -m "Merge duplicate .pokemon-types block, use border-radius var, delete dead transition line"
```

---

## Task 7: Mark the modern-ui-redesign plan as historical/complete

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-modern-ui-redesign.md`

**Interfaces:** None — documentation-only change, no code or test impact.

**Context:** `docs/superpowers/plans/2026-07-27-modern-ui-redesign.md` describes the font/color/typography redesign work, which has been fully implemented, tested, and merged (confirmed via `git log` — the redesign commits are already on this branch and shipped). Every step checkbox in that file is still unchecked (`- [ ]`), which misrepresents the plan as not-yet-started to anyone reading it later. This task adds a clear "completed" marker at the top of the file rather than manually re-checking every one of its ~20+ individual step checkboxes (checking each box has no informational value beyond a single top-of-file note, and risks a copy-paste slip on a large mechanical edit).

- [ ] **Step 1: Add a completion note under the plan's title**

Read the current first few lines of the file to confirm exact current content:
```bash
head -n 10 docs/superpowers/plans/2026-07-27-modern-ui-redesign.md
```
You should see the title line `# Modern-UI Redesign Implementation Plan` followed by the `REQUIRED SUB-SKILL` blockquote line, then a blank line, then the `**Goal:**` line. Insert a new line immediately after the title (before the `REQUIRED SUB-SKILL` blockquote):

```markdown
# Modern-UI Redesign Implementation Plan

> **Status: COMPLETE.** All tasks in this plan have been implemented, tested, and merged into `modern-ui-redesign`. Checkboxes below were not retroactively checked off; treat this note as authoritative over the unchecked `- [ ]` markers throughout the rest of the file.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
```

(i.e. add one new blockquote line between the title and the existing `REQUIRED SUB-SKILL` blockquote line — do not remove or alter the existing `REQUIRED SUB-SKILL` line, since that line is a required convention for every plan file, historical or not.)

- [ ] **Step 2: Run the full test suite**

Run: `node --test`
Expected: all 30 tests pass (this is a markdown-only change with zero code impact — this step just confirms the working tree is otherwise still healthy before committing).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-27-modern-ui-redesign.md
git commit -m "Mark modern-ui-redesign plan as complete"
```

---

## Verification (after all tasks)

1. `node --test` — 30/30 tests passing, zero failures.
2. Full manual pass in a browser (fresh load, `ignoreCache: true` if using a devtools-driven check): search by name, search by number, search by fuzzy/partial match with one result and with many results, click a suggestion, navigate with the D-pad, reload the page and confirm the last-viewed Pokémon is restored, open the keyboard shortcuts overlay, flip the sprite. Nothing here should look or behave differently from before this plan — every task is a pure internal/structural refactor.
3. `git log --oneline` should show 7 new commits (one per task above), each independently revertable.
