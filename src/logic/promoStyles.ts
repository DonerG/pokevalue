const KEY = 'pokevalue-promo-styles-v1'

export type PromoStyle = 'art' | 'normal'
export type PromoStyles = Record<string, PromoStyle>

export function loadPromoStyles(): PromoStyles {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function savePromoStyles(styles: PromoStyles): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(styles))
  } catch {
    // localStorage unavailable — tags only last for this session
  }
}
