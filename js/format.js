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
