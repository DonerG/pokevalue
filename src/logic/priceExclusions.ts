const KEY = 'pokevalue-price-exclusions-v1'

// Parsing lives in plain JS so the Node build scripts apply the identical rule —
// see src/logic/priceReview.js for what each verdict means.
export { correctedTrend, isPriceWrong, reviewKind } from './priceReview.js'

/**
 * "wrong" excludes the card from training and hides its price on site. "verified" means the
 * price is real (e.g. hype-driven) and the model just can't explain it — kept in training,
 * only recorded so a re-review pass can skip it. `{ corrected: n }` replaces the broken price
 * with the hand-read Cardmarket trend price, used both on the site and in training.
 */
export type PriceReview = 'wrong' | 'verified' | { corrected: number }
export type PriceExclusions = Record<string, PriceReview>

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
