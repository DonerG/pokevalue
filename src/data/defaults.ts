export type FactorId =
  | 'rarity'
  | 'era'
  | 'popularity'
  | 'supply'
  | 'condition'
  | 'language'
  | 'edition'

export type Stage = 'karte' | 'exemplar'

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
    label: 'Seltenheit / Hitrate',
    description: 'Wie selten ist die Karte beim Öffnen von Packs?',
    stage: 'karte',
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
    label: 'Alter / Ära',
    description: 'Aus welcher Zeit stammt das Set der Karte?',
    stage: 'karte',
    defaultOption: 'current',
    options: [
      { id: 'current', label: 'Aktuelles Set', hint: 'ab 2024', multiplier: 1 },
      { id: 'modern', label: 'Modern', hint: '2017–2023', multiplier: 1.2 },
      { id: 'mid', label: 'Mittel', hint: '2011–2016', multiplier: 1.5 },
      { id: 'exdp', label: 'EX-/DP-Ära', hint: '2003–2010', multiplier: 3 },
      { id: 'wotc', label: 'WOTC / Vintage', hint: '1999–2003', multiplier: 8 },
    ],
  },
  {
    id: 'popularity',
    label: 'Beliebtheit des Pokémon',
    description: 'Wie gefragt ist das abgebildete Pokémon bei Sammlern?',
    stage: 'karte',
    defaultOption: 'c',
    options: [
      { id: 's', label: 'Tier S', hint: 'Glurak, Pikachu, Mewtu, Evoli …', multiplier: 5 },
      { id: 'a', label: 'Tier A', hint: 'Starter, Legendäre, Fan-Lieblinge', multiplier: 2.5 },
      { id: 'b', label: 'Tier B', hint: 'beliebt', multiplier: 1.3 },
      { id: 'c', label: 'Tier C', hint: 'Durchschnitt', multiplier: 1 },
      { id: 'd', label: 'Tier D', hint: 'kaum gefragt', multiplier: 0.7 },
    ],
  },
  {
    id: 'supply',
    label: 'Angebot / Population',
    description: 'Wie viele Exemplare sind tatsächlich am Markt verfügbar?',
    stage: 'karte',
    defaultOption: 'normal',
    options: [
      { id: 'mass', label: 'Massenware', hint: 'riesige Auflage, überall erhältlich', multiplier: 0.5 },
      { id: 'normal', label: 'Normal', multiplier: 1 },
      { id: 'scarce', label: 'Knapp', multiplier: 2 },
      { id: 'rare', label: 'Selten am Markt', multiplier: 4 },
      { id: 'barely', label: 'Kaum verfügbar', hint: 'nur vereinzelte Angebote', multiplier: 8 },
    ],
  },
  {
    id: 'condition',
    label: 'Zustand',
    description: 'Erhaltungszustand bzw. Grading deines Exemplars.',
    stage: 'exemplar',
    defaultOption: 'nm',
    options: [
      { id: 'psa10', label: 'PSA 10', hint: 'Gem Mint', multiplier: 5 },
      { id: 'psa9', label: 'PSA 9', hint: 'Mint', multiplier: 2 },
      { id: 'psa8', label: 'PSA 8', hint: 'NM-Mint', multiplier: 1.2 },
      { id: 'nm', label: 'Near Mint', hint: 'ungegradet', multiplier: 1 },
      { id: 'lp', label: 'Lightly Played', multiplier: 0.7 },
      { id: 'mp', label: 'Moderately Played', multiplier: 0.45 },
      { id: 'hp', label: 'Heavily Played', multiplier: 0.25 },
      { id: 'dmg', label: 'Damaged', multiplier: 0.1 },
    ],
  },
  {
    id: 'language',
    label: 'Sprache',
    description: 'In welcher Sprache ist die Karte gedruckt?',
    stage: 'exemplar',
    defaultOption: 'en',
    options: [
      { id: 'en', label: 'Englisch', multiplier: 1 },
      { id: 'jp', label: 'Japanisch', multiplier: 1 },
      { id: 'de', label: 'Deutsch', multiplier: 0.7 },
      { id: 'other', label: 'Andere', multiplier: 0.5 },
    ],
  },
  {
    id: 'edition',
    label: 'Auflage',
    description: 'Besonderheiten des Drucks bzw. der Auflage.',
    stage: 'exemplar',
    defaultOption: 'unlimited',
    options: [
      { id: 'unlimited', label: 'Unlimited', hint: 'normale Auflage', multiplier: 1 },
      { id: 'first', label: '1st Edition', multiplier: 5 },
      { id: 'shadowless', label: 'Shadowless', multiplier: 3 },
      { id: 'promo', label: 'Promo / Stempel', multiplier: 1.5 },
    ],
  },
]

export const CARD_FACTORS = FACTORS.filter((f) => f.stage === 'karte')
export const EXEMPLAR_FACTORS = FACTORS.filter((f) => f.stage === 'exemplar')

/** Alle Multiplikatoren, Anker und Schwellen — vom Nutzer im Experten-Modus anpassbar. */
export interface Config {
  /** Grundwert in €: was eine gewöhnliche moderne Holo-Karte wert ist. */
  anchor: number
  /** Schwellen in %, ab denen eine Karte als über-/unterbewertet gilt. */
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
