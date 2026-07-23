// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * search.js — pure, stateless fuzzy-search helpers over the Pokémon name list.
 * No DOM and no app state: every function is deterministic and unit-testable
 * (see search.test.js).
 */

/**
 * Levenshtein edit distance between two strings.
 *
 * Uses two rolling rows instead of a full matrix (O(min(m, n)) space) and, when
 * a threshold is given, bails out early once every value in the current row
 * exceeds it. Callers that only care whether the distance is within a small
 * bound (e.g. <= 1) should pass that bound as the threshold.
 *
 * @param {string} s1
 * @param {string} s2
 * @param {number} [threshold=Infinity] - stop early once the distance exceeds
 *   this; returns threshold + 1 in that case.
 * @returns {number} the edit distance (or threshold + 1 if it exceeds threshold)
 */
export function computeLevenshtein(s1, s2, threshold = Infinity) {
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Keep s1 the shorter string so a row stays as small as possible.
  if (m > n) return computeLevenshtein(s2, s1, threshold);

  let prevRow = new Array(n + 1);
  let currRow = new Array(n + 1);
  for (let j = 0; j <= n; j++) prevRow[j] = j;

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    let minInRow = i;

    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost, // substitution
      );
      if (currRow[j] < minInRow) minInRow = currRow[j];
    }

    // The row minimum never decreases as i grows, so once it passes the
    // threshold the final distance cannot come back under it.
    if (minInRow > threshold) return threshold + 1;

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n];
}

/**
 * Split a name into tokens (hyphens/underscores become spaces). Names are
 * stored lowercase, so no lowercasing is done here.
 * @param {string} name
 * @returns {string[]}
 */
export function tokenize(name) {
  return name.replace(/[-_]/g, " ").split(/\s+/);
}

/**
 * Tokenize a whole list of names, aligned by index with the input.
 * @param {string[]} names
 * @returns {string[][]}
 */
export function tokenizeNames(names) {
  return names.map(tokenize);
}

/**
 * Fuzzy-match `query` against `names` (already lowercase), using a precomputed
 * per-name token list (from tokenizeNames, aligned by index).
 *
 * Literal matches (names containing the query) come first, ranked by how well
 * they match — exact, then prefix, then a word-boundary (token) match, then a
 * mid-string match — keeping the original list order within a rank. So typing
 * "mew" lists "mew" before "mewtwo". When nothing matches literally, it falls
 * back to a multi-token pass with per-token Levenshtein <= 1 typo tolerance
 * (e.g. "charzard" -> "charizard", "mega charizard" -> "charizard-mega").
 *
 * @param {string[]} names
 * @param {string} query
 * @param {string[][]} nameTokens
 * @returns {string[]} up to 100 matching names, most relevant first
 */
export function fuzzySearch(names, query, nameTokens) {
  const q = query.toLowerCase();
  if (!q.trim()) return [];

  // 1. Literal matches, ranked by quality:
  //    0 exact · 1 prefix · 2 word-boundary (a token starts with q) · 3 mid-string
  const literal = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const at = name.indexOf(q);
    if (at === -1) continue;
    let rank;
    if (name === q) rank = 0;
    else if (at === 0) rank = 1;
    else if ((nameTokens[i] || []).some((t) => t.startsWith(q))) rank = 2;
    else rank = 3;
    literal.push({ name, rank, i });
  }
  if (literal.length > 0) {
    // Best rank first; preserve the original (dex) order within a rank.
    literal.sort((a, b) => a.rank - b.rank || a.i - b.i);
    return literal.slice(0, 100).map((m) => m.name);
  }

  // 2. Multi-token matching with per-token typo tolerance (fallback for typos
  //    and reordered special forms).
  const queryTokens = q.replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return [];

  const tokenMatches = [];
  for (let i = 0; i < names.length; i++) {
    const tokens = nameTokens[i];
    if (
      queryTokens.every((qt) =>
        tokens.some((nt) => nt.startsWith(qt) || computeLevenshtein(qt, nt, 1) <= 1),
      )
    ) {
      tokenMatches.push(names[i]);
      if (tokenMatches.length >= 100) break;
    }
  }

  return tokenMatches.slice(0, 100);
}
