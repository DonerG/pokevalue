const KEY = 'pokevalue-promo-styles-v1'

/** Mirrors PROMO_STYLE_LABELS in scripts/lib/cardMapping.mjs — keep in sync. */
export type PromoStyle = 'altart10' | 'altart9' | 'altart8' | 'altart0' | 'stamped' | 'normal'

export const PROMO_STYLE_OPTIONS: { id: PromoStyle; label: string; hint: string }[] = [
  { id: 'altart10', label: 'Alt Art 10', hint: 'full unique illustration, best of them' },
  { id: 'altart9', label: 'Alt Art 9', hint: 'full unique illustration' },
  { id: 'altart8', label: 'Alt Art 8', hint: 'full unique illustration, plainer' },
  { id: 'altart0', label: 'Alt Art (weak)', hint: 'alt art, but the illustration does little for it' },
  { id: 'stamped', label: 'Stamped', hint: 'ordinary card, carries an event stamp' },
  { id: 'normal', label: 'Normal', hint: 'ordinary card, no stamp, no real artwork' },
]
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
