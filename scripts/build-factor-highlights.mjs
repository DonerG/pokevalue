/**
 * Distills analysis/factors.json (~450KB, every level of every category) into
 * a small JSON of illustrative examples for the public "How it works" page.
 * Shipping the full file to every visitor would be wasteful — the page only
 * needs a representative slice, not all 1,026 Pokémon.
 *
 * Only levels with enough supporting cards are eligible for the "top" lists:
 * a factor backed by one or two cards is mostly regularization noise and
 * would make the page look like it's claiming precision it doesn't have.
 *
 * Run after analysis/fit_factors.py. Usage: node scripts/build-factor-highlights.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ANALYSIS_DIR = join(HERE, '..', 'analysis')
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const OUT_FILE = join(GENERATED_DIR, 'factor-highlights.json')

const MIN_N = 15 // supporting cards required before a level can appear in a "top" list
const TOP_COUNT = 12

const factors = JSON.parse(await readFile(join(ANALYSIS_DIR, 'factors.json'), 'utf8'))
const report = JSON.parse(await readFile(join(ANALYSIS_DIR, 'model_report.json'), 'utf8'))
const pokedexNames = JSON.parse(
  await readFile(join(HERE, '..', 'src', 'data', 'generated', 'pokedex-names.json'), 'utf8'),
)

function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** [{ label, factor, n }] sorted by factor descending, only well-supported levels. */
function topOf(category, { limit = TOP_COUNT, minN = MIN_N, label = (k) => k, skip = () => false } = {}) {
  return Object.entries(factors.factors[category])
    .filter(([key, v]) => v.n >= minN && !skip(key))
    .map(([key, v]) => ({ label: label(key), factor: v.factor, n: v.n }))
    .sort((a, b) => b.factor - a.factor)
    .slice(0, limit)
}

const pokemonLabel = (key) => (pokedexNames[key] ? titleCase(pokedexNames[key]) : `#${key}`)

// Rarity and card-type labels are era-specific: a "Rare Holo LV.X", a "VMAX" or
// a "PRIME" never appears in the sets currently on the site, so listing them on
// How-it-works is confusing. Restrict those two tables to labels that actually
// occur in the displayed sets. (Pokémon and illustrators aren't era-bound this
// way, so they're left as-is — the model still fits every era for accuracy.)
const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))
const displayedRarities = new Set()
const displayedCardTypes = new Set()
for (const set of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8'))
  for (const c of cards) {
    if (c.rarity) displayedRarities.add(c.rarity)
    if (c.cardType) displayedCardTypes.add(c.cardType)
  }
}

const highlights = {
  model: {
    // Displayed-set numbers are the headline: they measure accuracy on cards
    // someone can actually look up on the site. cards/cardsTotal are shown
    // together so the page can be upfront about training on a much larger
    // historical corpus without implying the whole thing is what's graded.
    cards: report.nDisplayedRows,
    cardsTotal: report.nRows,
    testR2: report.displayedTestR2,
    medianError: report.displayedMedianAPE,
    within20: report.displayedWithin20,
    byPriceBand: report.byPriceBand,
    anchor: factors.anchor,
    categories: report.categoryCardinality,
  },
  topPokemon: topOf('pokemon', { label: pokemonLabel, skip: (k) => k === 'none' }),
  rarities: topOf('rarity', { limit: 14, minN: 30, skip: (k) => !displayedRarities.has(k) }),
  topIllustrators: topOf('illustrator', { minN: 25 }),
  cardTypes: topOf('cardType', {
    limit: 10,
    minN: 20,
    skip: (k) => k === 'Standard' || !displayedCardTypes.has(k),
  }),
  // Rarity x year is the clearest illustration of why the interaction exists,
  // so pick one rarity and walk it through time rather than showing a top list.
  // Every fourth year keeps it readable while still spanning 1999 to now.
  rarityAcrossEras: Object.entries(factors.factors.rarityYear)
    .filter(([key, v]) => key.startsWith('Rare | ') && v.n >= 20)
    .map(([key, v]) => ({ label: key.split(' | ')[1], factor: v.factor, n: v.n }))
    .filter((r) => /^\d{4}$/.test(r.label))
    .sort((a, b) => a.label.localeCompare(b.label))
    .filter((_, i, all) => i % Math.ceil(all.length / 7) === 0 || i === all.length - 1),
}

await writeFile(OUT_FILE, JSON.stringify(highlights, null, 1))
console.log(
  `Wrote factor highlights (${highlights.topPokemon.length} Pokémon, ${highlights.rarities.length} rarities, ` +
    `${highlights.topIllustrators.length} illustrators, ${highlights.cardTypes.length} card types) to ${OUT_FILE}`,
)
