/**
 * Is a Cardmarket trend price plausible on the feed's own terms?
 *
 * The feed ships a 30-day average alongside every trend price, and the two can
 * only drift so far apart before one of them is broken: across the ~1,300 cards
 * trading above €1, the trend sits between 0.42× and 2.25× its own avg30 for all
 * but a handful, and every card outside 0.35×–3× turns out to be a genuinely bad
 * feed value (a €10 card quoted at €0.02, a €430 card quoted at €140). So the
 * avg30 is a free, self-contained sanity anchor — no history, no cross-card
 * comparison, no model needed.
 *
 * Cheap cards are exempt: at €0.02 vs €0.07 the ratio is rounding noise, not
 * signal, so anything averaging under €1 gets no opinion.
 *
 * Returns true (plausible), false (implausible) or null (can't tell) — callers
 * must treat null as "no opinion", not as a verdict.
 */

// Bounds on trend ÷ avg30. Measured against the shipped card set: 8 of 1,287
// cards above €1 fall outside, and all 8 are known-bad prices.
export const ANCHOR_LO = 0.35
export const ANCHOR_HI = 3

// Below this 30-day average, cent-level rounding swamps the ratio.
export const ANCHOR_MIN_AVG = 1

export function trendPlausibility(trend, avg30) {
  if (trend == null || !(trend > 0)) return null
  if (avg30 == null || !(avg30 >= ANCHOR_MIN_AVG)) return null
  const ratio = trend / avg30
  return ratio >= ANCHOR_LO && ratio <= ANCHOR_HI
}

/** Convenience for consumers that only want to drop known-bad prices. */
export function isImplausibleTrend(trend, avg30) {
  return trendPlausibility(trend, avg30) === false
}
