const KEY = 'pokevalue-price-exclusions-v1'

/** "wrong" excludes the card from training and hides its price on site. "verified" means the
 * price is real (e.g. hype-driven) and the model just can't explain it — kept in training,
 * only recorded so a re-review pass can skip it. */
export type PriceReview = 'wrong' | 'verified'
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
