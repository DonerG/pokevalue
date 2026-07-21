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

/** Basiswert der Karte (Stufe 1): Anker × Seltenheit × Ära × Beliebtheit × Angebot. */
export function baseValue(selection: Selection, config: Config): number {
  return config.anchor * product(CARD_FACTORS, selection, config)
}

/** Fairer Preis eines konkreten Exemplars (Stufe 2): Basiswert × Zustand × Sprache × Auflage. */
export function fairPrice(selection: Selection, config: Config): number {
  return baseValue(selection, config) * product(EXEMPLAR_FACTORS, selection, config)
}

/**
 * Karten-Score 0–100: logarithmische Lage des Karten-Produkts zwischen dem
 * schwächst- und stärkstmöglichen Produkt der aktuellen Multiplikatoren.
 * Unabhängig von Anker und Exemplar-Faktoren, dadurch zwischen Karten vergleichbar.
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

export type VerdictKind = 'unterbewertet' | 'fair' | 'ueberbewertet'

export interface Verdict {
  kind: VerdictKind
  /** Abweichung des Marktpreises vom fairen Preis, z. B. 0.35 = 35 % darüber. */
  deviation: number
}

export function verdict(marketPrice: number, fair: number, config: Config): Verdict | null {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0 || fair <= 0) return null
  const deviation = (marketPrice - fair) / fair
  if (deviation > config.thresholds.over / 100) return { kind: 'ueberbewertet', deviation }
  if (deviation < -config.thresholds.under / 100) return { kind: 'unterbewertet', deviation }
  return { kind: 'fair', deviation }
}

const euroFmt = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' })
const euroFmtRound = new Intl.NumberFormat('de-AT', {
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
  return `${sign}${pct.toLocaleString('de-AT', { maximumFractionDigits: 0 })} %`
}

/** Parst Zahleneingaben mit Komma ("12,50") oder Punkt ("12.50") als Dezimaltrenner. */
export function parseGermanNumber(input: string): number {
  const s = input.trim()
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return parseFloat(s)
}
