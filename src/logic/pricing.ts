import {
  CARD_FACTORS,
  EXEMPLAR_FACTORS,
  type Config,
  type FactorDef,
  type Selection,
} from '../data/defaults'

function product(factors: FactorDef[], selection: Selection, config: Config): number {
  return factors.reduce((acc, f) => acc * (config.multipliers[f.id][selection[f.id]] ?? 1), 1)
}

/** Card base value (stage 1): anchor × rarity × era × popularity × supply. */
export function baseValue(selection: Selection, config: Config): number {
  return config.anchor * product(CARD_FACTORS, selection, config)
}

/** Fair price of a specific copy (stage 2): base value × condition × language × edition. */
export function fairPrice(selection: Selection, config: Config): number {
  return baseValue(selection, config) * product(EXEMPLAR_FACTORS, selection, config)
}

/**
 * Card score 0–100: logarithmic position of the card's product between the
 * weakest and strongest possible product of the current multipliers.
 * Independent of the anchor and copy factors, so it's comparable across cards.
 */
export function score(selection: Selection, config: Config): number {
  let min = 1
  let max = 1
  for (const f of CARD_FACTORS) {
    const values = Object.values(config.multipliers[f.id]).filter((v) => v > 0)
    if (values.length === 0) continue
    min *= Math.min(...values)
    max *= Math.max(...values)
  }
  const current = product(CARD_FACTORS, selection, config)
  if (current <= 0 || max <= min) return 0
  const s = (100 * (Math.log10(current) - Math.log10(min))) / (Math.log10(max) - Math.log10(min))
  return Math.min(100, Math.max(0, s))
}

export type VerdictKind = 'undervalued' | 'fair' | 'overvalued'

export interface Verdict {
  kind: VerdictKind
  /** Deviation of the market price from the fair price, e.g. 0.35 = 35% above. */
  deviation: number
}

export function verdict(marketPrice: number, fair: number, config: Config): Verdict | null {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0 || fair <= 0) return null
  const deviation = (marketPrice - fair) / fair
  if (deviation > config.thresholds.over / 100) return { kind: 'overvalued', deviation }
  if (deviation < -config.thresholds.under / 100) return { kind: 'undervalued', deviation }
  return { kind: 'fair', deviation }
}

const euroFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
const euroFmtRound = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function formatEuro(value: number): string {
  return value >= 1000 ? euroFmtRound.format(value) : euroFmt.format(value)
}

export function formatPercent(value: number): string {
  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toLocaleString('en-IE', { maximumFractionDigits: 0 })}%`
}

/** Parses number input using either a comma or a dot as the decimal separator. */
export function parseNumber(input: string): number {
  const s = input.trim()
  if (s.includes(',') && !s.includes('.')) return parseFloat(s.replace(',', '.'))
  return parseFloat(s.replace(/,/g, ''))
}
