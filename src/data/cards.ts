import setsJson from './generated/sets.json'
import pricingMetaJson from './generated/pricing-meta.json'
import pokedexNamesJson from './generated/pokedex-names.json'

const POKEDEX_NAMES = pokedexNamesJson as Record<string, string>

/** Species name for a Pokémon factor's dex-id key ("6" -> "Charizard") — not the card's own title, which may carry a "ex"/"V"/"Mega " suffix that belongs to the card type factor instead. */
export function pokemonSpeciesName(dexKey: string): string {
  const name = POKEDEX_NAMES[dexKey]
  if (!name) return `Pokémon #${dexKey}`
  return name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

export interface CardMarket {
  trend: number | null
  avg30: number | null
  low: number | null
  updated: string | null
}

/** One computed factor: the raw statistical estimate, the (small-sample-dampened) value actually used for pricing, and how many cards support it. */
export interface FactorEntry {
  key: string
  factor: number
  displayFactor: number
  n: number
  usedFallback: boolean
}

export interface CardFactors {
  pokemon: FactorEntry
  rarity: FactorEntry
  illustrator: FactorEntry
  set: FactorEntry
  cardType: FactorEntry
  cardName: FactorEntry
  rarityEra: FactorEntry
  cardTypeEra: FactorEntry
}

export interface CardData {
  id: string
  localId: string
  name: string
  category: string
  rarity: string | null
  illustrator: string | null
  cardType: string | null
  dexIds: number[]
  image: string | null
  market: CardMarket | null
  /** Hand-flagged via #/admin/price-audit as having a known-wrong Cardmarket price — `market` is null because of this, not because TCGdex has no data. */
  priceFlagged: boolean
  /** Data-derived fair value before condition/language: anchor × every factor in `factors`. */
  baseValue: number
  factors: CardFactors
}

export interface SetMeta {
  id: string
  name: string
  serie: string | null
  releaseDate: string
  logo: string | null
  symbol: string | null
  cardCount: number
  withMarket: number
}

export interface PricingMeta {
  minBaseValue: number
  maxBaseValue: number
}

export const SETS: SetMeta[] = setsJson as SetMeta[]
export const PRICING_META: PricingMeta = pricingMetaJson as PricingMeta

// Lazy (code-split) — with 27+ sets, eagerly bundling every set's cards would
// bloat the main chunk for every visitor. Each cards-*.json only loads when
// its set is actually opened.
const cardModuleLoaders = import.meta.glob('./generated/cards-*.json') as Record<
  string,
  () => Promise<{ default: CardData[] }>
>

const loaderBySet: Record<string, () => Promise<{ default: CardData[] }>> = {}
for (const [path, loader] of Object.entries(cardModuleLoaders)) {
  const setId = path.match(/cards-(.+)\.json$/)![1]
  loaderBySet[setId] = loader
}

export function getSet(setId: string): SetMeta | undefined {
  return SETS.find((s) => s.id === setId)
}

/** Dynamic import result is cached by the module system, so repeat calls are free. */
export async function loadCards(setId: string): Promise<CardData[]> {
  const loader = loaderBySet[setId]
  if (!loader) return []
  const mod = await loader()
  return mod.default
}

export async function loadCard(cardId: string): Promise<CardData | undefined> {
  const setId = cardId.slice(0, cardId.lastIndexOf('-'))
  const cards = await loadCards(setId)
  return cards.find((c) => c.id === cardId)
}

/** TCGdex image URL: needs a quality + format suffix. */
export function cardImage(card: CardData, quality: 'low' | 'high'): string | null {
  return card.image ? `${card.image}/${quality}.webp` : null
}

export function setLogo(set: SetMeta): string | null {
  return set.logo ? `${set.logo}.webp` : null
}

// Defined in src/logic/pageMeta.js (shared with the prerender script, which
// needs it for each card page's structured-data offer URL).
export { cardmarketUrl } from '../logic/pageMeta.js'

export interface ArtworkCandidate {
  id: string
  name: string
  localId: string
  image: string | null
  rarity: string | null
  setId: string | null
  setName: string | null
  releaseDate: string | null
  price: number
}

/**
 * Lazily loaded (dynamic import) so the ~700KB candidate list only ships to
 * whoever actually opens the hidden artwork-rating page, not every visitor.
 */
export async function loadArtworkCandidates(): Promise<ArtworkCandidate[]> {
  const mod = await import('./generated/artwork-candidates.json')
  return mod.default as unknown as ArtworkCandidate[]
}

export interface PromoCandidate {
  id: string
  name: string
  localId: string
  image: string | null
  setId: string | null
  setName: string | null
  releaseDate: string | null
  price: number
}

/** Lazily loaded, same reasoning as loadArtworkCandidates. */
export async function loadPromoCandidates(): Promise<PromoCandidate[]> {
  const mod = await import('./generated/promo-candidates.json')
  return mod.default as unknown as PromoCandidate[]
}

export interface OutlierCandidate {
  id: string
  name: string
  localId: string
  image: string | null
  rarity: string | null
  setId: string
  setName: string
  releaseDate: string
  market: number
  fair: number
  deviation: number
}

export interface OutlierCandidates {
  overvalued: OutlierCandidate[]
  undervalued: OutlierCandidate[]
}

/** Lazily loaded, same reasoning as loadArtworkCandidates. */
export async function loadOutlierCandidates(): Promise<OutlierCandidates> {
  const mod = await import('./generated/outlier-candidates.json')
  return mod.default as unknown as OutlierCandidates
}

export interface FactorExample {
  label: string
  factor: number
  n: number
}

export interface FactorHighlights {
  model: {
    cards: number
    cardsTotal: number
    testR2: number
    medianError: number
    anchor: number
    categories: Record<string, number>
  }
  topPokemon: FactorExample[]
  rarities: FactorExample[]
  topIllustrators: FactorExample[]
  cardTypes: FactorExample[]
  rarityAcrossEras: FactorExample[]
}

/** Lazily loaded — only the "How it works" page needs it. */
export async function loadFactorHighlights(): Promise<FactorHighlights> {
  const mod = await import('./generated/factor-highlights.json')
  return mod.default as unknown as FactorHighlights
}

export interface SearchIndexCard {
  id: string
  name: string
  localId: string
  image: string | null
  rarity: string | null
  setId: string
  setName: string
}

/**
 * Lazily loaded (not part of the main bundle) but the homepage kicks the
 * fetch off on mount rather than waiting for the first keystroke, so it's
 * usually already in by the time someone finishes typing.
 */
export async function loadSearchIndex(): Promise<SearchIndexCard[]> {
  const mod = await import('./generated/search-index.json')
  return mod.default as unknown as SearchIndexCard[]
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}
