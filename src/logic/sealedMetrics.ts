import sealedData from '../data/sealed-prices.json'
import { getSet } from '../data/cards'
import { MEGA_SETS, type SealedLang, type SealedPrices } from './sealedPrices'

/** A Booster Bundle is six packs — the number every per-pack figure divides by. */
export const PACKS_PER_BUNDLE = 6

const data = sealedData as SealedPrices

export interface LangMetrics {
  booster?: number
  bundle?: number
  /** Bundle price split across its six packs. */
  bundlePerPack?: number
  /** bundlePerPack / booster − 1: how much more (or less) a pack costs bought as a bundle. */
  bundleVsSingle?: number
  sleeved?: number
  /** sleeved / booster − 1: the extra you pay for the sleeved version. */
  sleevedPremium?: number
}

export interface SetSealed {
  id: string
  name: string
  logo: string | null
  releaseDate: string
  de: LangMetrics
  en: LangMetrics
  /** en.booster / de.booster − 1. */
  enVsDeBooster?: number
  /** en.bundle / de.bundle − 1. */
  enVsDeBundle?: number
  /** Cheapest single-pack route across both languages, for the at-a-glance figure. */
  cheapestPack?: { price: number; lang: SealedLang }
}

function langMetrics(raw: SealedPrices[string] | undefined, lang: SealedLang): LangMetrics {
  const p = raw?.[lang] ?? {}
  const m: LangMetrics = { booster: p.booster, bundle: p.bundle, sleeved: p.sleeved }
  if (p.bundle != null) {
    m.bundlePerPack = p.bundle / PACKS_PER_BUNDLE
    if (p.booster) m.bundleVsSingle = m.bundlePerPack / p.booster - 1
  }
  if (p.sleeved != null && p.booster) m.sleevedPremium = p.sleeved / p.booster - 1
  return m
}

function cheapestPack(de: LangMetrics, en: LangMetrics): SetSealed['cheapestPack'] {
  const routes: { price: number; lang: SealedLang }[] = []
  if (de.booster != null) routes.push({ price: de.booster, lang: 'de' })
  if (en.booster != null) routes.push({ price: en.booster, lang: 'en' })
  return routes.sort((a, b) => a.price - b.price)[0]
}

/** Every Mega Evolution set that has any sealed data, newest first, with metrics computed. */
export function sealedSets(): SetSealed[] {
  return MEGA_SETS.filter((s) => data[s.id])
    .map((s) => {
      const raw = data[s.id]
      const de = langMetrics(raw, 'de')
      const en = langMetrics(raw, 'en')
      const meta = getSet(s.id)
      const row: SetSealed = {
        id: s.id,
        name: s.name,
        logo: meta?.logo ? `${meta.logo}.webp` : null,
        releaseDate: s.releaseDate,
        de,
        en,
        cheapestPack: cheapestPack(de, en),
      }
      if (de.booster && en.booster) row.enVsDeBooster = en.booster / de.booster - 1
      if (de.bundle && en.bundle) row.enVsDeBundle = en.bundle / de.bundle - 1
      return row
    })
}

export interface Insight {
  setId: string
  setName: string
  value: number
}

/** Pick the set with the minimum (or maximum) of a metric, ignoring sets where it's absent. */
function pick(
  rows: SetSealed[],
  metric: (r: SetSealed) => number | undefined,
  mode: 'min' | 'max',
): Insight | null {
  let best: Insight | null = null
  for (const r of rows) {
    const v = metric(r)
    if (v == null) continue
    if (best == null || (mode === 'min' ? v < best.value : v > best.value)) {
      best = { setId: r.id, setName: r.name, value: v }
    }
  }
  return best
}

export interface SealedInsights {
  cheapestPack: Insight | null
  bestBundleValue: Insight | null
  smallestSleevedPremium: Insight | null
  smallestLangGap: Insight | null
}

export function sealedInsights(rows: SetSealed[]): SealedInsights {
  return {
    // Lowest single-booster price anywhere.
    cheapestPack: pick(rows, (r) => r.cheapestPack?.price, 'min'),
    // Bundle whose per-pack price sits lowest relative to a single booster.
    bestBundleValue: pick(
      rows,
      (r) => [r.de.bundleVsSingle, r.en.bundleVsSingle].filter((x): x is number => x != null).sort((a, b) => a - b)[0],
      'min',
    ),
    // English sleeved that costs the least extra over a plain English booster.
    smallestSleevedPremium: pick(rows, (r) => r.en.sleevedPremium, 'min'),
    // Set where the English booster is closest to the German one.
    smallestLangGap: pick(rows, (r) => r.enVsDeBooster, 'min'),
  }
}
