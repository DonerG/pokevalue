export type FactorId =
  | 'rarity'
  | 'era'
  | 'popularity'
  | 'condition'
  | 'language'
  | 'edition'

export type Stage = 'card' | 'copy'

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
  stage: Stage
  options: FactorOption[]
  defaultOption: string
}

export const FACTORS: FactorDef[] = [
  {
    id: 'rarity',
    label: 'Rarity / Hit Rate',
    description: 'How rare is the card when opening packs?',
    stage: 'card',
    defaultOption: 'holo',
    options: [
      { id: 'common', label: 'Common', multiplier: 0.1 },
      { id: 'uncommon', label: 'Uncommon', multiplier: 0.2 },
      { id: 'rare', label: 'Rare', multiplier: 0.5 },
      { id: 'holo', label: 'Holo Rare', multiplier: 1 },
      { id: 'ultra', label: 'Ultra Rare', hint: 'EX / GX / V / ex', multiplier: 3 },
      { id: 'fullart', label: 'Full Art', multiplier: 6 },
      { id: 'secret', label: 'Secret / Gold', multiplier: 10 },
      { id: 'altart', label: 'Alt Art / SIR', hint: 'Special Illustration Rare', multiplier: 20 },
    ],
  },
  {
    id: 'era',
    label: 'Age / Era',
    description: 'Which era is the card’s set from?',
    stage: 'card',
    defaultOption: 'current',
    options: [
      { id: 'current', label: 'Current Set', hint: 'since 2024', multiplier: 1 },
      { id: 'modern', label: 'Modern', hint: '2017–2023', multiplier: 1.2 },
      { id: 'mid', label: 'Mid', hint: '2011–2016', multiplier: 1.5 },
      { id: 'exdp', label: 'EX/DP Era', hint: '2003–2010', multiplier: 3 },
      { id: 'wotc', label: 'WOTC / Vintage', hint: '1999–2003', multiplier: 8 },
    ],
  },
  {
    id: 'popularity',
    label: 'Pokémon Popularity',
    description: 'How sought-after is the depicted Pokémon among collectors?',
    stage: 'card',
    defaultOption: 'c',
    options: [
      { id: 's', label: 'Tier S', hint: 'Charizard, Pikachu, Mewtwo, Eevee …', multiplier: 5 },
      { id: 'a', label: 'Tier A', hint: 'Starters, Legendaries, fan favorites', multiplier: 2.5 },
      { id: 'b', label: 'Tier B', hint: 'popular', multiplier: 1.3 },
      { id: 'c', label: 'Tier C', hint: 'average', multiplier: 1 },
      { id: 'd', label: 'Tier D', hint: 'low demand', multiplier: 0.7 },
    ],
  },
  {
    id: 'condition',
    label: 'Condition',
    description: 'Grading or condition of your copy.',
    stage: 'copy',
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
    stage: 'copy',
    defaultOption: 'en',
    options: [
      { id: 'en', label: 'English', multiplier: 1 },
      { id: 'jp', label: 'Japanese', multiplier: 1 },
      { id: 'de', label: 'German', multiplier: 0.7 },
      { id: 'other', label: 'Other', multiplier: 0.5 },
    ],
  },
  {
    id: 'edition',
    label: 'Edition',
    description: 'Print run specifics.',
    stage: 'copy',
    defaultOption: 'unlimited',
    options: [
      { id: 'unlimited', label: 'Unlimited', hint: 'standard print run', multiplier: 1 },
      { id: 'first', label: '1st Edition', multiplier: 5 },
      { id: 'shadowless', label: 'Shadowless', multiplier: 3 },
      { id: 'promo', label: 'Promo / Stamped', multiplier: 1.5 },
    ],
  },
]

export const CARD_FACTORS = FACTORS.filter((f) => f.stage === 'card')
export const EXEMPLAR_FACTORS = FACTORS.filter((f) => f.stage === 'copy')

/** All multipliers, the anchor, and the thresholds — adjustable by the user in expert mode. */
export interface Config {
  /** Base value in €: what an ordinary modern holo card is worth. */
  anchor: number
  /** Thresholds in %, above/below which a card counts as over-/undervalued. */
  thresholds: { over: number; under: number }
  multipliers: Record<FactorId, Record<string, number>>
}

export function defaultConfig(): Config {
  const multipliers = {} as Record<FactorId, Record<string, number>>
  for (const f of FACTORS) {
    multipliers[f.id] = Object.fromEntries(f.options.map((o) => [o.id, o.multiplier]))
  }
  return { anchor: 1, thresholds: { over: 20, under: 20 }, multipliers }
}

export type Selection = Record<FactorId, string>

export function defaultSelection(): Selection {
  return Object.fromEntries(FACTORS.map((f) => [f.id, f.defaultOption])) as Selection
}
