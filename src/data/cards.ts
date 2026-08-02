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

/** One view's per-factor breakdown. Only the categories that view uses are
    present (broad: no year/set terms; standard: no set term; local: all), so
    entries are looked up by key rather than assumed. `pokemon` carries the tier
    fields; `displayFactor` already includes the tier exponent. */
export type Breakdown = Partial<
  Record<
    'pokemon' | 'rarity' | 'illustrator' | 'set' | 'cardType' | 'cardName' | 'rarityYear' | 'cardTypeYear' | 'artwork' | 'raritySet',
    FactorEntry & { tier?: 'bulk' | 'mid' | 'chase'; tierExponent?: number }
  >
>

export interface CardBreakdowns {
  broad: Breakdown
  standard: Breakdown
  local: Breakdown
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
  /** Price was hand-read off Cardmarket to replace a broken one — trend only, no 30-day average. */
  priceCorrected?: boolean
  /** For corrected cards only: the current automatic Cardmarket price, kept so the admin corrections list can show manual vs. live side by side. */
  rawMarket?: { trend: number | null; updated: string | null }
  /** Shipped fair value before condition/language: the MEDIAN of the three variant estimates in `fairs`. */
  baseValue: number
  /** The three model variants' fair prices — see /how-it-works: broad (widest comparison circle), standard, local (same rarity, same set). */
  fairs: { broad: number; standard: number; local: number }
  /** Per-factor breakdown for each of the three views — see PriceBreakdown. */
  breakdowns: CardBreakdowns
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

/** Loads a set of cards by id across sets, for the watchlist and portfolio pages. */
export async function loadCardsByIds(ids: string[]): Promise<CardData[]> {
  const bySet = new Map<string, Set<string>>()
  for (const id of ids) {
    const setId = id.slice(0, id.lastIndexOf('-'))
    if (!bySet.has(setId)) bySet.set(setId, new Set())
    bySet.get(setId)!.add(id)
  }
  const out: CardData[] = []
  await Promise.all(
    [...bySet].map(async ([setId, want]) => {
      const cards = await loadCards(setId)
      for (const c of cards) if (want.has(c.id)) out.push(c)
    }),
  )
  return out
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

export interface CorrectionCandidate {
  id: string
  name: string
  localId: string
  image: string | null
  setName: string
  manualTrend: number | null
  rawTrend: number | null
  rawUpdated: string | null
}

/**
 * Every hand-corrected card, for the /admin/corrections review list: the manual
 * price we ship next to the current automatic Cardmarket price (rawMarket, kept
 * by ingest), so the reviewer can spot a card Cardmarket has since fixed and
 * hand it back to the automatic feed. Built on the fly from the shipped card
 * JSON — the corrected set is small.
 */
export async function loadCorrectionCandidates(): Promise<CorrectionCandidate[]> {
  const perSet = await Promise.all(
    SETS.map(async (set) => {
      const cards = await loadCards(set.id)
      return cards
        .filter((c) => c.priceCorrected)
        .map((c) => ({
          id: c.id,
          name: c.name,
          localId: c.localId,
          image: c.image,
          setName: set.name,
          manualTrend: c.market?.trend ?? null,
          rawTrend: c.rawMarket?.trend ?? null,
          rawUpdated: c.rawMarket?.updated ?? null,
        }))
    }),
  )
  return perSet.flat().sort((a, b) => (b.manualTrend ?? 0) - (a.manualTrend ?? 0))
}

export interface UndervaluedPick {
  id: string
  name: string
  localId: string
  setName: string
  image: string | null
  market: number
  fair: number
  upside: number
  /** Each of the three views' verdict: 'u' undervalued, 'f' fair, 'o' overvalued. */
  views: ('u' | 'f' | 'o')[]
  unanimous: boolean
}

export async function loadUndervalued(): Promise<UndervaluedPick[]> {
  const mod = await import('./generated/undervalued.json')
  return mod.default as unknown as UndervaluedPick[]
}

export interface Mover {
  id: string
  name: string
  localId: string
  setName: string
  image: string | null
  market: number
  fair: number
  upside: number
  /** Change in upside (percentage points) since the previous snapshot. */
  delta: number
}

export interface Movers {
  asOf: string
  up: Mover[]
  down: Mover[]
}

export async function loadMovers(): Promise<Movers> {
  const mod = await import('./generated/movers.json')
  return mod.default as unknown as Movers
}

export interface TeraCandidate {
  id: string
  name: string
  localId: string
  image: string | null
  rarity: string | null
  setId: string
  setName: string
  releaseDate: string
  market: number | null
}

/**
 * Every ex card from the Scarlet & Violet-era sets, for the /admin/tera tagging
 * page. Built on the fly from the already-shipped per-set card JSON (filtered
 * to Scarlet & Violet sets, card type ex) rather than a separate generated
 * candidate file — the set data is right there, and this list is only ever
 * fetched by the one hidden admin page. Sorted set-by-set (newest first),
 * number ascending, so the reviewer can work through a set at a time. Tera is a
 * Scarlet & Violet mechanic, so Mega-era (me*) sets are deliberately excluded.
 */
export async function loadTeraCandidates(): Promise<TeraCandidate[]> {
  const svSets = SETS.filter((s) => /^sv/.test(s.id))
  const perSet = await Promise.all(
    svSets.map(async (set) => {
      const cards = await loadCards(set.id)
      return cards
        .filter((c) => c.cardType != null && /ex/i.test(c.cardType))
        .map((c) => ({
          id: c.id,
          name: c.name,
          localId: c.localId,
          image: c.image,
          rarity: c.rarity,
          setId: set.id,
          setName: set.name,
          releaseDate: set.releaseDate,
          market: c.market?.trend ?? null,
        }))
    }),
  )
  return perSet
    .flat()
    .sort(
      (a, b) =>
        b.releaseDate.localeCompare(a.releaseDate) || a.localId.localeCompare(b.localId, undefined, { numeric: true }),
    )
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
    within20: number
    byPriceBand: Record<string, { n: number; medianAPE: number; within20: number }>
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
