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
const OUT_FILE = join(HERE, '..', 'src', 'data', 'generated', 'factor-highlights.json')

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

const highlights = {
  model: {
    // Displayed-set numbers are the headline: they measure accuracy on cards
    // someone can actually look up on the site. cards/cardsTotal are shown
    // together so the page can be upfront about training on a much larger
    // historical corpus without implying the whole thing is what's graded.
    cards: report.nDisplayedRows,
    cardsTotal: report.nRows,
    testR2: report.displayedTestR2,
    medianError: report.displayedTestMedianAPE,
    anchor: factors.anchor,
    categories: report.categoryCardinality,
  },
  topPokemon: topOf('pokemon', { label: pokemonLabel, skip: (k) => k === 'none' }),
  rarities: topOf('rarity', { limit: 14, minN: 30 }),
  topIllustrators: topOf('illustrator', { minN: 25 }),
  cardTypes: topOf('cardType', { limit: 10, minN: 20, skip: (k) => k === 'Standard' }),
  // Rarity x era is the clearest illustration of why the interaction exists,
  // so pick one rarity and show it across every era rather than a top list.
  rarityAcrossEras: ['WOTC', 'EX/DP', 'BW/XY', 'SM/SWSH', 'SV+']
    .map((era) => {
      const entry = factors.factors.rarityEra[`Rare | ${era}`]
      return entry ? { label: era, factor: entry.factor, n: entry.n } : null
    })
    .filter(Boolean),
}

await writeFile(OUT_FILE, JSON.stringify(highlights, null, 1))
console.log(
  `Wrote factor highlights (${highlights.topPokemon.length} Pokémon, ${highlights.rarities.length} rarities, ` +
    `${highlights.topIllustrators.length} illustrators, ${highlights.cardTypes.length} card types) to ${OUT_FILE}`,
)
