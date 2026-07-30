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
export { verdict, viewsSentence } from './verdict.js'

// Live in plain JS so the Node prerender script can format prices identically —
// see src/logic/format.js. Re-exported here so app code keeps its old import.
export { formatEuro, formatPercent } from './format.js'

/** Parses number input using either a comma or a dot as the decimal separator. */
export function parseNumber(input: string): number {
  const s = input.trim()
  if (s.includes(',') && !s.includes('.')) return parseFloat(s.replace(',', '.'))
  return parseFloat(s.replace(/,/g, ''))
}
