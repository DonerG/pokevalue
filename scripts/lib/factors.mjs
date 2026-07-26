/**
 * Looks up the data-derived pricing factors (analysis/factors.json, produced
 * by analysis/fit_factors.py) for a given raw card and computes its base
 * value. Used by ingest.mjs to bake computed prices into the site's display
 * data — the site itself never loads the (much larger) raw factors file.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artworkGrade, effectiveDexIds, effectiveRarity, mapCardType, releaseYear, rarityTier } from './cardMapping.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FACTORS_PATH = join(HERE, '..', '..', 'analysis', 'factors.json')
const PROMO_STYLES_PATH = join(HERE, '..', '..', 'src', 'data', 'promo-styles.json')
const ARTWORK_RATINGS_PATH = join(HERE, '..', '..', 'src', 'data', 'artwork-ratings.json')

let cachedArtworkRatings = null
function loadArtworkRatings() {
  if (!cachedArtworkRatings) {
    try {
      cachedArtworkRatings = JSON.parse(readFileSync(ARTWORK_RATINGS_PATH, 'utf8'))
    } catch {
      cachedArtworkRatings = {}
    }
  }
  return cachedArtworkRatings
}

let cachedPromoStyles = null
function loadPromoStyles() {
  if (!cachedPromoStyles) {
    try {
      cachedPromoStyles = JSON.parse(readFileSync(PROMO_STYLES_PATH, 'utf8'))
    } catch {
      cachedPromoStyles = {}
    }
  }
  return cachedPromoStyles
}

/** Below this many supporting cards, a factor is pulled toward neutral (1x) for on-site
 * display — the raw statistically-estimated value (with its confidence interval) is what
 * ships in the PDF report instead. Avoids a single freak card dominating a shown price. */
const FULL_TRUST_N = 5

let cached = null
export function loadFactors() {
  if (!cached) cached = JSON.parse(readFileSync(FACTORS_PATH, 'utf8'))
  return cached
}

function dampen(factor, n) {
  const weight = Math.min(1, n / FULL_TRUST_N)
  return 1 + (factor - 1) * weight
}

function lookup(table, key) {
  const entry = table[key]
  if (!entry) return { key, factor: 1, displayFactor: 1, n: 0, usedFallback: true }
  return {
    key,
    factor: entry.factor,
    displayFactor: dampen(entry.factor, entry.n),
    n: entry.n,
    usedFallback: false,
  }
}

/**
 * Computes a card's data-derived base value + the per-factor breakdown for
 * display. `releaseDate` is the card's SET's release date (the per-card API
 * response doesn't carry it) — pass `set.releaseDate` from the already-
 * loaded set metadata; only used to bucket the rarity x era factor.
 */
export function computeCardPricing(card, releaseDate) {
  const data = loadFactors()
  const dexIds = effectiveDexIds(card)
  const pokemonKey = dexIds[0] != null ? String(dexIds[0]) : 'none'
  const promoStyles = loadPromoStyles()
  const rarityValue = effectiveRarity(card, promoStyles) ?? 'None'
  const artworkKey = artworkGrade(card.id, loadArtworkRatings(), promoStyles)
  const illustratorKey = card.illustrator ?? 'Unknown'
  const setKey = card.set?.id ?? 'unknown'
  const cardTypeKey = mapCardType(card) ?? 'Standard'
  const cardNameKey = dexIds.length ? 'n/a' : (card.name ?? 'n/a')
  const year = releaseYear(releaseDate)
  const tier = rarityTier(rarityValue)
  const rarityYearKey = `${rarityValue} | ${year}`
  const cardTypeYearKey = `${cardTypeKey} | ${year}`

  const pokemonRaw = lookup(data.factors.pokemon, pokemonKey)
  const rarity = lookup(data.factors.rarity, rarityValue)
  const illustrator = lookup(data.factors.illustrator, illustratorKey)
  const set = lookup(data.factors.set, setKey)
  const cardType = lookup(data.factors.cardType, cardTypeKey)
  const cardName = lookup(data.factors.cardName, cardNameKey)
  const rarityYear = lookup(data.factors.rarityYear, rarityYearKey)
  const cardTypeYear = lookup(data.factors.cardTypeYear, cardTypeYearKey)
  const artwork = lookup(data.factors.artwork, artworkKey)

  // A Pokémon's premium is not a constant multiplier — it is ~2x stronger on
  // chase cards than on bulk ones (see analysis/fit_factors.py). The fitted
  // exponent per tier is what carries that, applied AFTER dampening so a
  // low-sample factor that was pulled to neutral (1x) stays neutral: 1^n = 1.
  const tierExponent = data.pokemonTierExponent?.[tier] ?? 1
  const pokemon = {
    ...pokemonRaw,
    tier,
    tierExponent,
    displayFactor: Math.pow(pokemonRaw.displayFactor, tierExponent),
  }

  const baseValue =
    data.anchor *
    pokemon.displayFactor *
    rarity.displayFactor *
    illustrator.displayFactor *
    set.displayFactor *
    cardType.displayFactor *
    cardName.displayFactor *
    rarityYear.displayFactor *
    cardTypeYear.displayFactor *
    artwork.displayFactor

  return {
    baseValue,
    breakdown: { pokemon, rarity, illustrator, set, cardType, cardName, rarityYear, cardTypeYear, artwork },
  }
}
