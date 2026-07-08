import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLevenshtein,
  tokenize,
  tokenizeNames,
  fuzzySearch,
} from "./search.js";

test("computeLevenshtein: basic distances", () => {
  assert.equal(computeLevenshtein("", ""), 0);
  assert.equal(computeLevenshtein("abc", "abc"), 0);
  assert.equal(computeLevenshtein("abc", "abd"), 1);
  assert.equal(computeLevenshtein("kitten", "sitting"), 3);
  assert.equal(computeLevenshtein("charizard", "charizrd"), 1); // one deletion
  assert.equal(computeLevenshtein("abc", ""), 3);
});

test("computeLevenshtein: threshold early-exit preserves the <= threshold decision", () => {
  // Exceeds threshold -> returns threshold + 1, but the "within bound?" answer is unchanged.
  assert.ok(computeLevenshtein("abc", "xyz", 1) > 1);
  assert.ok(computeLevenshtein("charizard", "charizrd", 1) <= 1);
  assert.equal(computeLevenshtein("kitten", "sitting", 1), 2); // 3 > 1 -> threshold + 1
});

test("tokenize: splits hyphens and underscores", () => {
  assert.deepEqual(tokenize("charizard-mega-x"), ["charizard", "mega", "x"]);
  assert.deepEqual(tokenize("pikachu"), ["pikachu"]);
  assert.deepEqual(tokenize("a_b"), ["a", "b"]);
});

const NAMES = [
  "bulbasaur", "ivysaur", "venusaur", "charmander", "charmeleon",
  "charizard", "charizard-mega-x", "charizard-mega-y", "pikachu", "raichu", "eevee",
];
const TOKENS = tokenizeNames(NAMES);

test("fuzzySearch: exact substring tier", () => {
  assert.deepEqual(fuzzySearch(NAMES, "saur", TOKENS).sort(),
    ["bulbasaur", "ivysaur", "venusaur"].sort());
});

test("fuzzySearch: prefix tier", () => {
  const r = fuzzySearch(NAMES, "char", TOKENS);
  assert.ok(r.includes("charizard") && r.includes("charmander"));
});

test("fuzzySearch: reordered multi-token special form", () => {
  const r = fuzzySearch(NAMES, "mega charizard", TOKENS);
  assert.ok(r.includes("charizard-mega-x"));
  assert.ok(r.includes("charizard-mega-y"));
});

test("fuzzySearch: typo tolerance via per-token Levenshtein <= 1", () => {
  assert.ok(fuzzySearch(NAMES, "charizrd", TOKENS).includes("charizard"));
});

test("fuzzySearch: empty / whitespace query returns nothing", () => {
  assert.deepEqual(fuzzySearch(NAMES, "   ", TOKENS), []);
});

test("fuzzySearch: nonsense query returns nothing (no garbage recall)", () => {
  assert.deepEqual(fuzzySearch(NAMES, "xqzk", TOKENS), []);
});
