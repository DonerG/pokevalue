/**
 * How a hand-reviewed price verdict is interpreted, shared by the site and the
 * build scripts.
 *
 * Plain JS for the same reason as format.js / verdict.js: scripts/ingest.mjs
 * and scripts/build-training-data.mjs read src/data/price-exclusions.json under
 * bare Node, while the admin page writes it in the browser. One parser means a
 * verdict can't mean one thing at build time and another on screen.
 *
 * Three verdicts, stored per card id in price-exclusions.json:
 *
 *   "wrong"              TCGdex's price is broken and we have nothing better.
 *                        Dropped from training, price hidden on the site.
 *   "verified"           The price is real, the model just can't explain it
 *                        (hype, tournament relevance). Kept everywhere; the tag
 *                        only records that it was already looked at.
 *   { "corrected": n }   TCGdex's price is broken and the real Cardmarket trend
 *                        price is n. Used both on the site and in training, in
 *                        place of the broken one.
 *
 * A correction carries only the trend price on purpose: it's the number the
 * site shows and the model is fitted on, and it's the one a human can read off
 * Cardmarket directly. There is no hand-entered 30-day average, so a corrected
 * card shows its trend price alone (see CardPage) rather than displaying a
 * stale average next to a fixed trend.
 *
 * Legacy: the first version of the audit page stored a plain `true` per
 * excluded card. Those survive in browser localStorage and come back through
 * exports, so `true` is read as "wrong" rather than being silently ignored —
 * which is what used to happen, quietly letting a known-bad price back into
 * both the model and the site.
 */

/**
 * @typedef {'wrong' | 'verified' | { corrected: number }} PriceReview
 */

/**
 * The hand-entered trend price for a card, or null if this verdict isn't a correction.
 * @param {PriceReview | undefined} review
 * @returns {number | null}
 */
export function correctedTrend(review) {
  if (review && typeof review === 'object' && typeof review.corrected === 'number') {
    return Number.isFinite(review.corrected) && review.corrected > 0 ? review.corrected : null
  }
  return null
}

/**
 * Should this card's price be suppressed entirely? True only for "wrong" —
 * a correction replaces the price rather than removing it.
 * @param {PriceReview | undefined} review
 * @returns {boolean}
 */
export function isPriceWrong(review) {
  return review === 'wrong' || review === true
}

/**
 * Which of the three verdicts this is, for UI state. null = not reviewed yet.
 * @param {PriceReview | undefined} review
 * @returns {'wrong' | 'verified' | 'corrected' | null}
 */
export function reviewKind(review) {
  if (review === 'verified') return 'verified'
  if (isPriceWrong(review)) return 'wrong'
  if (correctedTrend(review) != null) return 'corrected'
  return null
}

/**
 * Anything stored that isn't one of the recognised verdicts. A build script
 * should shout about these rather than skip them: an unrecognised value looks
 * like a reviewed card in the admin UI while doing nothing at all to the price.
 * @param {Record<string, unknown>} exclusions
 * @returns {string[]} card ids with an unusable value
 */
export function unrecognisedReviews(exclusions) {
  return Object.entries(exclusions ?? {})
    .filter(([, v]) => reviewKind(v) == null)
    .map(([id]) => id)
}
