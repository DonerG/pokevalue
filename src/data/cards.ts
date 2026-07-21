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
  preset: { rarity: string; era: string; popularity: string; supply: string }
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

const cardModules = import.meta.glob('./generated/cards-*.json', { eager: true }) as Record<
  string,
  { default: CardData[] }
>

const cardsBySet: Record<string, CardData[]> = {}
for (const [path, mod] of Object.entries(cardModules)) {
  const setId = path.match(/cards-(.+)\.json$/)![1]
  cardsBySet[setId] = mod.default
}

export function getSet(setId: string): SetMeta | undefined {
  return SETS.find((s) => s.id === setId)
}

export function getCards(setId: string): CardData[] {
  return cardsBySet[setId] ?? []
}

export function getCard(cardId: string): CardData | undefined {
  const setId = cardId.slice(0, cardId.lastIndexOf('-'))
  return cardsBySet[setId]?.find((c) => c.id === cardId)
}

/** Preset selection for a card: card factors from the import, copy set to NM/EN/Unlimited. */
export function selectionForCard(card: CardData): Selection {
  return {
    ...defaultSelection(),
    rarity: card.preset.rarity,
    era: card.preset.era,
    popularity: card.preset.popularity,
    supply: card.preset.supply,
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
