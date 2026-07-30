/**
 * Browser-side persistence for the Tera ex tagging page (/admin/tera).
 *
 * A Tera Pokémon ex trades above a plain ex and TCGdex doesn't mark it, so the
 * distinction is hand-tagged here and exported to src/data/tera-tags.json,
 * where the build pipeline reads it (see scripts/lib/cardMapping.mjs). Mirrors
 * the shape the build expects: a plain map of card id → true for the Tera ones.
 * Untagged ex cards are treated as a normal ex.
 */
const KEY = 'pokevalue-tera-tags-v1'

export type TeraTags = Record<string, true>

export function loadTeraTags(): TeraTags {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as TeraTags
  } catch {
    return {}
  }
}

export function saveTeraTags(tags: TeraTags): void {
  localStorage.setItem(KEY, JSON.stringify(tags))
}
