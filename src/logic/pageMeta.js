/**
 * Per-route page metadata — the single source of truth for every <title>,
 * meta description, and canonical/external URL on the site.
 *
 * Plain JS on purpose (not .ts), for the same reason as format.js: this module
 * is imported both by the browser bundle (src/logic/documentMeta.ts, applied at
 * runtime) and by scripts/prerender.mjs (baked into the static HTML at build
 * time, which is what a crawler that doesn't run JavaScript reads). Deriving
 * both from one module is what guarantees they can never disagree.
 *
 * Every builder returns `{ title, description }` with `title` un-suffixed —
 * resolveTitle() appends the site name, so the two call sites can't format it
 * differently either.
 */

import { formatEuro } from './format.js'

export const SITE_NAME = 'PokéValue'
export const SITE_ORIGIN = 'https://pokevalue.cards'
export const DEFAULT_TITLE = 'PokéValue – Card Value Calculator'
export const DEFAULT_DESCRIPTION =
  'PokéValue estimates a fair price for Pokémon cards with a regression model trained on real Cardmarket data, and compares it against the current market price — set by set.'

/**
 * @param {string | null} title
 * @returns {string}
 */
export function resolveTitle(title) {
  return title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE
}

/**
 * @param {string | null} description
 * @returns {string}
 */
export function resolveDescription(description) {
  return description ?? DEFAULT_DESCRIPTION
}

/** @typedef {{ title: string | null, description: string | null }} PageMeta */

/** @returns {PageMeta} */
export function homeMeta() {
  return { title: null, description: null }
}

/** @returns {PageMeta} */
export function howItWorksMeta() {
  return {
    title: 'How the fair price is calculated',
    description:
      'How PokéValue estimates a fair price for every Pokémon card: a ridge regression trained on ~19,000 real Cardmarket prices, with a separate computed factor for Pokémon, rarity, illustrator, set, and card type.',
  }
}

/**
 * @param {{ name: string, cardCount: number } | null | undefined} set
 * @returns {PageMeta}
 */
export function setMeta(set) {
  if (!set) return { title: 'Set not found', description: null }
  return {
    title: `${set.name} card prices`,
    description: `Fair price estimates for all ${set.cardCount} cards in ${set.name}, compared against current Cardmarket prices. Find which cards are over- or undervalued.`,
  }
}

/**
 * @param {{ name: string, localId: string, baseValue: number, market?: { trend?: number | null } | null } | null | undefined} card
 * @param {{ name: string } | null | undefined} set
 * @returns {PageMeta}
 */
export function cardMeta(card, set) {
  if (!card) return { title: null, description: null }
  const inSet = set ? ` (${set.name})` : ''
  const fromSet = set ? ` from ${set.name}` : ''
  const trend = card.market?.trend
  return {
    title: `${card.name} #${card.localId}${inSet} price`,
    description:
      `What is ${card.name} #${card.localId}${fromSet} worth? ` +
      `PokéValue's fair price is ${formatEuro(card.baseValue)}` +
      (trend != null ? `, against a current Cardmarket price of ${formatEuro(trend)}.` : '.'),
  }
}

/**
 * Cardmarket has no public direct product-ID URL, so this links to their
 * general product search with the card name + local number as the query —
 * reliably narrows to the exact card (verified for name/number collisions).
 * The set-scoped Singles URL (/Products/Singles/{set}?searchString=...)
 * looks like it should filter but silently ignores searchString entirely,
 * landing on the full unfiltered category page — confirmed by hand.
 *
 * @param {{ name: string, localId: string }} card
 * @returns {string}
 */
export function cardmarketUrl(card) {
  const query = encodeURIComponent(`${card.name} ${card.localId}`)
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${query}`
}
