import setsJson from './generated/sets.json'
import { defaultSelection, type Selection } from './defaults'

export interface CardMarket {
  trend: number | null
  avg30: number | null
  low: number | null
  updated: string | null
}

export interface CardData {
  id: string
  localId: string
  name: string
  category: string
  rarity: string | null
  dexIds: number[]
  image: string | null
  market: CardMarket | null
  preset: { rarity: string; era: string; popularity: string }
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

export const SETS: SetMeta[] = setsJson as SetMeta[]

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

/** Preset selection for a card: card factors from the import, copy set to NM/EN/Unlimited. */
export function selectionForCard(card: CardData): Selection {
  return {
    ...defaultSelection(),
    rarity: card.preset.rarity,
    era: card.preset.era,
    popularity: card.preset.popularity,
  }
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

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}
