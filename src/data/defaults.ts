import { DEFAULT_THRESHOLDS } from '../logic/verdict.js'

// Nothing about a card is user-adjustable. Every price on the site is a fixed,
// data-derived fact computed at build time (see analysis/fit_factors.py and
// scripts/lib/factors.mjs).
//
// There used to be a "your copy" panel here with hand-set condition and
// language multipliers. It was removed: those were assumptions rather than
// computed factors — Cardmarket's price data cannot distinguish a card by
// grade or by language (verified: querying TCGdex in different languages for
// the same physical card returns the identical Cardmarket product and price),
// so the numbers could never be more than a guess dressed up as a calculation.

/** The over-/undervalued thresholds. The only thing left to configure. */
export interface Config {
  thresholds: { over: number; under: number }
}

export function defaultConfig(): Config {
  return { thresholds: { ...DEFAULT_THRESHOLDS } }
}
