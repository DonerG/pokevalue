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

/**
 * Cardmarket has no public direct product-ID URL, so this links to their singles
 * search scoped to the set, with the card name + local number as the query —
 * reliably narrows to the exact card (verified for name/number collisions).
 */
export function cardmarketUrl(card: CardData, set: SetMeta): string {
  const setSlug = encodeURIComponent(set.name.replace(/\s+/g, '-'))
  const query = encodeURIComponent(`${card.name} ${card.localId}`)
  return `https://www.cardmarket.com/en/Pokemon/Products/Singles/${setSlug}?searchString=${query}`
}

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

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}
