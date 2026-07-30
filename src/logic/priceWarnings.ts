/**
 * Price warnings: a per-card, DISPLAY-ONLY caveat that the computed fair price
 * can't be trusted for this card, because the market itself is distorted —
 * tournament demand or deliberate manipulation. Unlike a price-exclusion
 * ("wrong" / "corrected"), a warning does not change the price or drop the card
 * from training; the number stays, with a note next to it.
 *
 * The preset reasons and the rendered sentence live in warningText.js so the
 * prerender (Node) shares them — see there. This file adds the TS types and the
 * browser-only localStorage read/write. Hand-maintained on the admin card
 * editor, exported to src/data/price-warnings.json, read by the public card
 * page and the prerender.
 */
import { WARNING_PRESETS as PRESETS, warningText as warningTextJs } from './warningText.js'

const KEY = 'pokevalue-price-warnings-v1'

export type WarningKind = 'tournament' | 'manipulation' | 'other'

export interface PriceWarning {
  kind: WarningKind
  /** Optional free text; overrides the preset sentence when set. */
  note?: string
}

export type PriceWarnings = Record<string, PriceWarning>

// Typed re-exports of the shared JS values, so consumers get real types.
export const WARNING_PRESETS: { kind: WarningKind; label: string; text: string }[] = PRESETS
export const warningText: (w: PriceWarning) => string = warningTextJs

export function loadPriceWarnings(): PriceWarnings {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as PriceWarnings
  } catch {
    return {}
  }
}

export function savePriceWarnings(w: PriceWarnings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(w))
  } catch {
    // localStorage unavailable — warnings only last for this session
  }
}
