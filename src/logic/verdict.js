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
