import { SETS, type SetMeta } from '../data/cards'

const KEY = 'pokevalue-sealed-prices-v1'

/**
 * Hand-entered market prices for sealed products, kept per set. Unlike the card
 * model there is deliberately NO computed fair price here — a sealed product's
 * fair value is too idiosyncratic to model, so the admin/user enters the real
 * market price and reads the *spreads* between products and languages instead:
 * how much more a Bundle costs than a Booster, a Sleeved Booster than a Booster,
 * and an English product than its German twin. Sets where a spread is unusually
 * small are the interesting ones — the caller decides whether the base price is
 * fair.
 *
 * Prices are in euros. A missing product or language just means "not entered".
 */
export type SealedLang = 'de' | 'en'
export type SealedProduct = 'booster' | 'sleeved' | 'bundle'

export type SealedSetPrices = Partial<Record<SealedLang, Partial<Record<SealedProduct, number>>>>
export type SealedPrices = Record<string, SealedSetPrices>

export const SEALED_LANGS: SealedLang[] = ['de', 'en']
export const SEALED_PRODUCTS: SealedProduct[] = ['booster', 'sleeved', 'bundle']

export const SEALED_LANG_LABELS: Record<SealedLang, string> = { de: 'Deutsch', en: 'English' }
export const SEALED_PRODUCT_LABELS: Record<SealedProduct, string> = {
  booster: 'Booster',
  sleeved: 'Sleeved Booster',
  bundle: 'Booster Bundle',
}

// Sets that were never sold as Sleeved Boosters. me02.5 "Ascended Heroes"
// (Erhabene Helden) is the special high-count set — Booster and Bundle only.
const NO_SLEEVED = new Set<string>(['me02.5'])

export function hasSleeved(setId: string): boolean {
  return !NO_SLEEVED.has(setId)
}

/** The products that apply to a given set, in display order. */
export function productsForSet(setId: string): SealedProduct[] {
  return SEALED_PRODUCTS.filter((p) => p !== 'sleeved' || hasSleeved(setId))
}

/** Mega Evolution sets, newest first (the order SETS already ships in). */
export const MEGA_SETS: SetMeta[] = SETS.filter((s) => s.serie === 'Mega Evolution')

export function loadSealedPrices(): SealedPrices {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SealedPrices) : {}
  } catch {
    return {}
  }
}

export function saveSealedPrices(prices: SealedPrices): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prices))
  } catch {
    // localStorage unavailable — prices only last for this session
  }
}

/**
 * Sets one product/language price and returns the next store, pruning empty
 * objects so an unset field leaves no trace (and export stays a true snapshot).
 * Pass null/undefined/NaN to clear a field.
 */
export function setSealedPrice(
  prices: SealedPrices,
  setId: string,
  lang: SealedLang,
  product: SealedProduct,
  value: number | null | undefined,
): SealedPrices {
  const next: SealedPrices = { ...prices }
  const set: SealedSetPrices = { ...(next[setId] ?? {}) }
  const langPrices = { ...(set[lang] ?? {}) }

  if (value == null || Number.isNaN(value)) delete langPrices[product]
  else langPrices[product] = value

  if (Object.keys(langPrices).length) set[lang] = langPrices
  else delete set[lang]

  if (Object.keys(set).length) next[setId] = set
  else delete next[setId]

  return next
}

export function getSealedPrice(
  prices: SealedPrices,
  setId: string,
  lang: SealedLang,
  product: SealedProduct,
): number | undefined {
  return prices[setId]?.[lang]?.[product]
}
