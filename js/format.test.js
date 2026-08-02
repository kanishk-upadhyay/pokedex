// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPokemonName, formatDexNumber } from "./format.js";

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

test("formatPokemonName: species with a hyphenated base name is not split as a form suffix", () => {
  assert.equal(formatPokemonName("ho-oh"), "Ho-Oh");
  assert.equal(formatPokemonName("porygon-z"), "Porygon-Z");
  assert.equal(formatPokemonName("mr-mime"), "Mr-Mime");
  assert.equal(formatPokemonName("tapu-koko"), "Tapu-Koko");
  assert.equal(formatPokemonName("jangmo-o"), "Jangmo-O");
});

test("formatPokemonName: hyphenated-base species still splits a real form suffix", () => {
  assert.equal(formatPokemonName("mr-mime-galar"), "Mr-Mime (Galar)");
  assert.equal(formatPokemonName("tapu-koko-totem"), "Tapu-Koko (Totem)");
});

test("formatDexNumber: pads to 3 digits with N° prefix", () => {
  assert.equal(formatDexNumber(25), "N°025");
  assert.equal(formatDexNumber(1), "N°001");
  assert.equal(formatDexNumber(150), "N°150");
});

test("formatDexNumber: non-finite input returns empty string", () => {
  assert.equal(formatDexNumber(NaN), "");
  assert.equal(formatDexNumber(undefined), "");
});
