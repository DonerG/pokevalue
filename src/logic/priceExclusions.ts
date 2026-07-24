const KEY = 'pokevalue-price-exclusions-v1'

export type PriceExclusions = Record<string, true>

export function loadPriceExclusions(): PriceExclusions {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function savePriceExclusions(exclusions: PriceExclusions): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(exclusions))
  } catch {
    // localStorage unavailable — exclusions only last for this session
  }
}
