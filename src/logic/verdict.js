/**
 * Over-/undervalued judgement, shared by the app and the build scripts.
 *
 * Plain JS for the same reason as format.js: scripts/prerender.mjs writes this
 * verdict into each card page's static HTML, and it must be the same call the
 * running app makes — not a second implementation that could drift.
 *
 * src/logic/pricing.ts re-exports `verdict` (with its TS types), and
 * src/data/defaults.ts takes its default thresholds from here.
 */

/** Percent gap to the fair price beyond which a card counts as over-/undervalued. */
export const DEFAULT_THRESHOLDS = { over: 20, under: 20 }

/**
 * @typedef {'undervalued' | 'fair' | 'overvalued'} VerdictKind
 * @typedef {{ kind: VerdictKind, deviation: number }} Verdict
 */

/**
 * @param {number} marketPrice
 * @param {number} fair
 * @param {{ thresholds: { over: number, under: number } }} config
 * @returns {Verdict | null}
 */
export function verdict(marketPrice, fair, config) {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0 || fair <= 0) return null
  const gapToFair = (marketPrice - fair) / fair
  // Potential move to reach the fair price, relative to the current market
  // price. Positive = upside (undervalued, price can rise this much);
  // negative = downside (overvalued, price can fall this much).
  const upside = (fair - marketPrice) / marketPrice
  if (gapToFair > config.thresholds.over / 100) return { kind: 'overvalued', deviation: upside }
  if (gapToFair < -config.thresholds.under / 100) return { kind: 'undervalued', deviation: upside }
  return { kind: 'fair', deviation: upside }
}

// ---------------------------------------------------------------- three-view sentence
//
// The three model variants (broad / standard / local, see fit_factors.py)
// differ only in the comparison window they use, so each one's verdict maps to
// a fixed clause naming that window. A card's overall sentence is composed from
// whichever views are NOT "fair" — the whole 27-way table (3 verdicts ^ 3
// views) falls out of this, so there are three clauses to maintain, not 27
// strings. A fair view contributes nothing; all-fair collapses to one line.

/** One clause per view, naming what that view compares the card against. */
const VIEW_CLAUSES = {
  broad: 'the broad average for a card like this',
  standard: 'similar cards from this era',
  local: 'other cards of the same rarity in this set',
}
const VIEW_ORDER = ['broad', 'standard', 'local']

/** "A", "A and with B", "A, with B, and with C" — always in broad→local order. */
function joinClauses(keys) {
  const c = keys.map((k) => VIEW_CLAUSES[k])
  if (c.length === 1) return c[0]
  if (c.length === 2) return `${c[0]} and with ${c[1]}`
  return `${c[0]}, with ${c[1]}, and with ${c[2]}`
}

/**
 * Plain-language summary of the three views for a card, e.g.
 * "This card is cheap compared with the broad average for a card like this,
 *  but expensive compared with other cards of the same rarity in this set."
 *
 * @param {{ broad: VerdictKind|null, standard: VerdictKind|null, local: VerdictKind|null }} kinds
 * @returns {string}
 */
export function viewsSentence(kinds) {
  const cheap = VIEW_ORDER.filter((k) => kinds[k] === 'undervalued')
  const pricey = VIEW_ORDER.filter((k) => kinds[k] === 'overvalued')
  if (cheap.length === 0 && pricey.length === 0) return 'This card is fairly valued at every level of comparison.'
  if (pricey.length === 0) return `This card is cheap compared with ${joinClauses(cheap)}.`
  if (cheap.length === 0) return `This card is expensive compared with ${joinClauses(pricey)}.`
  return `This card is cheap compared with ${joinClauses(cheap)}, but expensive compared with ${joinClauses(pricey)}.`
}
