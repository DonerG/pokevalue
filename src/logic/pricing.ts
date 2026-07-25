import { FACTORS, type Config, type Selection } from '../data/defaults'

/** Fair price of a specific copy: the card's data-derived base value × condition × language. */
export function fairPrice(baseValue: number, selection: Selection, config: Config): number {
  return FACTORS.reduce((acc, f) => acc * (config.multipliers[f.id][selection[f.id]] ?? 1), baseValue)
}

/**
 * Card score 0–100: logarithmic position of the card's base value between the
 * cheapest and priciest base value across every card currently on the site
 * (see pricing-meta.json) — an empirical percentile, not a guess.
 */
export function score(baseValue: number, minBaseValue: number, maxBaseValue: number): number {
  if (baseValue <= 0 || maxBaseValue <= minBaseValue) return 0
  const s =
    (100 * (Math.log10(baseValue) - Math.log10(minBaseValue))) /
    (Math.log10(maxBaseValue) - Math.log10(minBaseValue))
  return Math.min(100, Math.max(0, s))
}

export type VerdictKind = 'undervalued' | 'fair' | 'overvalued'

export interface Verdict {
  kind: VerdictKind
  /**
   * Potential move to reach the fair price, relative to the current market price.
   * Positive = upside (undervalued, price can rise this much); negative = downside
   * (overvalued, price can fall this much). E.g. 0.35 = can rise 35%, -0.35 = can fall 35%.
   */
  deviation: number
}

// Lives in plain JS so the Node prerender script reaches the same judgement —
// see src/logic/verdict.js.
export { verdict } from './verdict.js'

// Live in plain JS so the Node prerender script can format prices identically —
// see src/logic/format.js. Re-exported here so app code keeps its old import.
export { formatEuro, formatPercent } from './format.js'

/** Parses number input using either a comma or a dot as the decimal separator. */
export function parseNumber(input: string): number {
  const s = input.trim()
  if (s.includes(',') && !s.includes('.')) return parseFloat(s.replace(',', '.'))
  return parseFloat(s.replace(/,/g, ''))
}
