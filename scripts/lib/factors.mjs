/**
 * Looks up the data-derived pricing factors (analysis/factors.json, produced
 * by analysis/fit_factors.py) for a given raw card and computes its fair
 * value — under all THREE model variants (broad / standard / local, see the
 * fit script's docstring for why three exist). Used by ingest.mjs to bake
 * computed prices into the site's display data — the site itself never loads
 * the (much larger) raw factors file.
 *
 * The shipped headline value is the MEDIAN of the three variants' fair
 * prices; the three individual values ship alongside it so the site can show
 * how much the three views agree.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artworkGrade, effectiveDexIds, effectiveRarity, mapCardType, releaseYear } from './cardMapping.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FACTORS_PATH = join(HERE, '..', '..', 'analysis', 'factors.json')
const PROMO_STYLES_PATH = join(HERE, '..', '..', 'src', 'data', 'promo-styles.json')
const ARTWORK_RATINGS_PATH = join(HERE, '..', '..', 'src', 'data', 'artwork-ratings.json')

// Mirrors VARIANTS in analysis/fit_factors.py — keep both in sync. The three
// differ only in the comparison window: broad shares every intrinsic-attribute
// factor (artwork included) and the tier exponent, standard adds the ERA terms,
// local adds the SET term. So broad↔standard is a pure era effect and
// standard↔local a pure within-set effect.
const VARIANT_CATEGORIES = {
  broad: ['pokemon', 'rarity', 'illustrator', 'set', 'cardType', 'cardName', 'artwork'],
  standard: ['pokemon', 'rarity', 'illustrator', 'set', 'cardType', 'cardName', 'artwork', 'rarityYear', 'cardTypeYear'],
  local: ['pokemon', 'rarity', 'illustrator', 'set', 'cardType', 'cardName', 'artwork', 'rarityYear', 'cardTypeYear', 'raritySet'],
}

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

// There used to be a second shrinkage step here: any factor backed by fewer
// than 5 cards was pulled toward neutral before being shown. It is gone, for
// three measured reasons.
//
// It only ever applied at DISPLAY time, never in the fit — so the model was
// evaluated on numbers the site did not actually show, for 678 of 4,652 cards
// (14.6%). It measurably hurt: shipped median APE 23.9% with it, 22.8%
// without. And it duplicated work ridge already does — of 1,531 factors with
// n < 5, only five are stronger than 3x at all, and those are real (Paradise
// Resort at x13.7 backs a card that genuinely trades at EUR142).
//
// Worse, it actively fought the per-rarity calibration in fit_factors.py:
// on the Black White Rare cards it removed a third of a correction that had
// just been computed and leave-one-out validated.

let cached = null
export function loadFactors() {
  if (!cached) cached = JSON.parse(readFileSync(FACTORS_PATH, 'utf8'))
  return cached
}

function lookup(table, key) {
  const entry = table?.[key]
  if (!entry) return { key, factor: 1, displayFactor: 1, n: 0, usedFallback: true }
  return {
    key,
    factor: entry.factor,
    // Equal to `factor` for every category but pokemon, where the tier
    // exponent is applied on top — see variantValue().
    displayFactor: entry.factor,
    n: entry.n,
    usedFallback: false,
  }
}

/** One variant's fair value for the given per-category keys. */
function variantValue(variantData, keys, tier, withBreakdown) {
  let value = variantData.anchor ?? 1
  const breakdown = {}
  for (const [cat, key] of Object.entries(keys)) {
    if (!(cat in variantData.factors)) continue
    let entry = lookup(variantData.factors[cat], key)
    if (cat === 'pokemon') {
      // The Pokémon premium is tier-dependent (see fit_factors.py). A factor of
      // exactly 1x stays 1x under any exponent, so a level with no signal is
      // unaffected by the amplification.
      const tierExponent = variantData.pokemonTierExponent?.[tier] ?? 1
      entry = { ...entry, tier, tierExponent, displayFactor: Math.pow(entry.displayFactor, tierExponent) }
    }
    value *= entry.displayFactor
    if (withBreakdown) breakdown[cat] = entry
  }
  return { value, breakdown: withBreakdown ? breakdown : null }
}

/**
 * Computes a card's fair value under all three variants plus the shipped
 * median, and the standard variant's per-factor breakdown for display.
 * `releaseDate` is the card's SET's release date (the per-card API response
 * doesn't carry it) — pass `set.releaseDate` from the set metadata.
 */
export function computeCardPricing(card, releaseDate) {
  const data = loadFactors()
  const dexIds = effectiveDexIds(card)
  const promoStyles = loadPromoStyles()
  const rarityValue = effectiveRarity(card, promoStyles) ?? 'None'
  const setKey = card.set?.id ?? 'unknown'
  const cardTypeKey = mapCardType(card) ?? 'Standard'
  const year = releaseYear(releaseDate)
  // Price tier decides how strongly the Pokémon premium applies. Derived from
  // each rarity's actual median price at fit time and shipped in factors.json,
  // so there is no second hand-maintained list here to fall out of sync — the
  // previous one silently classified EUR380 "Black White Rare" cards as bulk.
  const tier = data.rarityTiers?.[rarityValue] ?? 'bulk'

  const keys = {
    pokemon: dexIds[0] != null ? String(dexIds[0]) : 'none',
    rarity: rarityValue,
    illustrator: card.illustrator ?? 'Unknown',
    set: setKey,
    cardType: cardTypeKey,
    cardName: dexIds.length ? 'n/a' : (card.name ?? 'n/a'),
    rarityYear: `${rarityValue} | ${year}`,
    cardTypeYear: `${cardTypeKey} | ${year}`,
    artwork: artworkGrade(card.id, loadArtworkRatings(), promoStyles),
    raritySet: `${rarityValue} | ${setKey}`,
  }

  const pick = (cats) => Object.fromEntries(cats.map((c) => [c, keys[c]]))
  const variantData = {
    broad: data.variants.broad,
    standard: data, // standard lives top-level for compatibility
    local: data.variants.local,
  }

  const fairs = {}
  let breakdown = null
  for (const [name, cats] of Object.entries(VARIANT_CATEGORIES)) {
    const { value, breakdown: b } = variantValue(variantData[name], pick(cats), tier, name === 'standard')
    fairs[name] = value
    if (b) breakdown = b
  }

  // The shipped number: the middle of the three estimates.
  const sorted = [fairs.broad, fairs.standard, fairs.local].sort((a, b) => a - b)
  const baseValue = sorted[1]

  return { baseValue, fairs, breakdown }
}
