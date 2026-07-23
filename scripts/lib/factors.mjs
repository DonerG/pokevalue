/**
 * Looks up the data-derived pricing factors (analysis/factors.json, produced
 * by analysis/fit_factors.py) for a given raw card and computes its base
 * value. Used by ingest.mjs to bake computed prices into the site's display
 * data — the site itself never loads the (much larger) raw factors file.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapCardType } from './cardMapping.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FACTORS_PATH = join(HERE, '..', '..', 'analysis', 'factors.json')

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

/** Computes a card's data-derived base value + the per-factor breakdown for display. */
export function computeCardPricing(card) {
  const data = loadFactors()
  const pokemonKey = card.dexId?.[0] != null ? String(card.dexId[0]) : 'none'
  const rarityKey = card.rarity ?? 'None'
  const illustratorKey = card.illustrator ?? 'Unknown'
  const setKey = card.set?.id ?? 'unknown'
  const cardTypeKey = mapCardType(card) ?? 'Standard'

  const pokemon = lookup(data.factors.pokemon, pokemonKey)
  const rarity = lookup(data.factors.rarity, rarityKey)
  const illustrator = lookup(data.factors.illustrator, illustratorKey)
  const set = lookup(data.factors.set, setKey)
  const cardType = lookup(data.factors.cardType, cardTypeKey)

  const baseValue =
    data.anchor *
    pokemon.displayFactor *
    rarity.displayFactor *
    illustrator.displayFactor *
    set.displayFactor *
    cardType.displayFactor

  return {
    baseValue,
    breakdown: { pokemon, rarity, illustrator, set, cardType },
  }
}
