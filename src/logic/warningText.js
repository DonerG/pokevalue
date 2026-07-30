/**
 * Shared, pure parts of the price-warning feature: the preset reasons and the
 * sentence a warning renders to. Plain JS for the same reason as verdict.js and
 * format.js — scripts/prerender.mjs (Node) writes the warning into each card
 * page's static HTML and must use the exact same text the running app shows.
 * The TypeScript side (priceWarnings.ts) adds types and the browser-only
 * localStorage read/write, and re-exports these two.
 *
 * @typedef {'tournament' | 'manipulation' | 'other'} WarningKind
 * @typedef {{ kind: WarningKind, note?: string }} PriceWarning
 */

/** @type {{ kind: WarningKind, label: string, text: string }[]} */
export const WARNING_PRESETS = [
  {
    kind: 'tournament',
    label: 'Tournament-relevant',
    text: 'This card is tournament-relevant, so its price tracks the competitive metagame and can move sharply — treat the fair price here as a rough guide only.',
  },
  {
    kind: 'manipulation',
    label: 'Market manipulation',
    text: 'This card has been a target of market manipulation, so its listed price may not reflect genuine demand — the fair price comparison is unreliable here.',
  },
]

/** The sentence shown to visitors for a given warning (custom note overrides the preset). */
export function warningText(w) {
  if (w.note && w.note.trim()) return w.note.trim()
  const preset = WARNING_PRESETS.find((p) => p.kind === w.kind)
  return preset ? preset.text : 'The market price of this card is distorted, so the fair price may be unreliable.'
}
