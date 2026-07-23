// Pokémon, rarity, illustrator, set, and card type are no longer here — they're
// fixed, data-derived facts computed per card at build time (see
// analysis/fit_factors.py and scripts/lib/factors.mjs), not user choices.
// Condition and language stay editable because Cardmarket's price data can't
// tell us those apart (see README) — they're reasonable assumptions, not
// computed factors, and are labeled as such in the UI.

export type FactorId = 'condition' | 'language'

export interface FactorOption {
  id: string
  label: string
  hint?: string
  multiplier: number
}

export interface FactorDef {
  id: FactorId
  label: string
  description: string
  options: FactorOption[]
  defaultOption: string
}

export const FACTORS: FactorDef[] = [
  {
    id: 'condition',
    label: 'Condition',
    description: 'Grading or condition of your copy.',
    defaultOption: 'nm',
    options: [
      { id: 'psa10', label: 'PSA 10', hint: 'Gem Mint', multiplier: 5 },
      { id: 'psa9', label: 'PSA 9', hint: 'Mint', multiplier: 2 },
      { id: 'psa8', label: 'PSA 8', hint: 'NM-Mint', multiplier: 1.2 },
      { id: 'nm', label: 'Near Mint', hint: 'ungraded', multiplier: 1 },
      { id: 'lp', label: 'Lightly Played', multiplier: 0.7 },
      { id: 'mp', label: 'Moderately Played', multiplier: 0.45 },
      { id: 'hp', label: 'Heavily Played', multiplier: 0.25 },
      { id: 'dmg', label: 'Damaged', multiplier: 0.1 },
    ],
  },
  {
    id: 'language',
    label: 'Language',
    description: 'What language is the card printed in?',
    defaultOption: 'en',
    options: [
      { id: 'en', label: 'English', multiplier: 1 },
      { id: 'jp', label: 'Japanese', multiplier: 1 },
      { id: 'de', label: 'German', multiplier: 0.7 },
      { id: 'other', label: 'Other', multiplier: 0.5 },
    ],
  },
]

/** Condition/language multipliers, plus the over-/undervalued thresholds. Not data-derived — see FACTORS above. */
export interface Config {
  thresholds: { over: number; under: number }
  multipliers: Record<FactorId, Record<string, number>>
}

export function defaultConfig(): Config {
  const multipliers = {} as Record<FactorId, Record<string, number>>
  for (const f of FACTORS) {
    multipliers[f.id] = Object.fromEntries(f.options.map((o) => [o.id, o.multiplier]))
  }
  return { thresholds: { over: 20, under: 20 }, multipliers }
}

export type Selection = Record<FactorId, string>

export function defaultSelection(): Selection {
  return Object.fromEntries(FACTORS.map((f) => [f.id, f.defaultOption])) as Selection
}
