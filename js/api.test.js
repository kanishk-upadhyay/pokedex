// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { Cache, spriteUrl, RequestQueue } from "./api.js";

test("Cache: evicts the least-recently-used entry when full", () => {
  const c = new Cache(2);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3); // exceeds maxSize -> evict LRU ("a")
  assert.equal(c.get("a"), null);
  assert.equal(c.get("b"), 2);
  assert.equal(c.get("c"), 3);
});

test("Cache: get() refreshes recency so the touched key survives eviction", () => {
  const c = new Cache(2);
  c.set("a", 1);
  c.set("b", 2);
  c.get("a"); // touch "a" -> it becomes most-recent
  c.set("c", 3); // LRU is now "b"
  assert.equal(c.get("b"), null);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
});

test("Cache: re-setting a key refreshes recency without growing size", () => {
  const c = new Cache(2);
  c.set("a", 1);
  c.set("b", 2);
  c.set("a", 11); // update "a" -> most-recent, size stays 2
  c.set("c", 3); // evict LRU "b"
  assert.equal(c.get("b"), null);
  assert.equal(c.get("a"), 11);
  assert.equal(c.get("c"), 3);
});

test("Cache: expired entries return null and are removed", () => {
  const c = new Cache(10, 1000); // 1s TTL
  c.set("a", 1);
  // Back-date the entry past its TTL (deterministic, no sleep).
  c.cache.get("a").timestamp -= 2000;
  assert.equal(c.get("a"), null);
  assert.equal(c.cache.has("a"), false);
});

test("Cache: expired entries are reclaimed before LRU eviction on set", () => {
  const c = new Cache(2, 1000);
  c.set("a", 1);
  c.set("b", 2);
  c.cache.get("a").timestamp -= 2000; // "a" is now expired
  c.set("c", 3); // cleanup drops expired "a"; "b" should survive
  assert.equal(c.get("a"), null);
  assert.equal(c.get("b"), 2);
  assert.equal(c.get("c"), 3);
});

test("spriteUrl: rewrites raw.githubusercontent to the jsDelivr mirror", () => {
  const raw =
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png";
  assert.equal(
    spriteUrl(raw),
    "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/25.png",
  );
});

test("spriteUrl: leaves non-matching URLs unchanged", () => {
  const other = "https://example.com/foo.png";
  assert.equal(spriteUrl(other), other);
});

test("spriteUrl: passes through non-string input", () => {
  assert.equal(spriteUrl(null), null);
  assert.equal(spriteUrl(undefined), undefined);
});

test("RequestQueue: reserves the next slot synchronously so concurrent calls don't race", async () => {
  const rq = new RequestQueue(50);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    const start = rq.lastRequestTime;
    const p1 = rq.enqueue("a"); // reservation happens synchronously, before any await
    const afterFirst = rq.lastRequestTime;
    const p2 = rq.enqueue("b");
    const afterSecond = rq.lastRequestTime;
    assert.ok(afterFirst >= start);
    assert.ok(afterSecond - afterFirst >= 50);
    await Promise.all([p1, p2]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
