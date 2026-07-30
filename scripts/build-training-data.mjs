/**
 * Reads the raw per-card cache from fetch-all-cards.mjs and distills it into
 * a compact training dataset: one row per card that has a real Cardmarket
 * price, with just the fields the pricing model needs. Cards without a price
 * (mostly digital-only "TCG Pocket" cards and a handful of obscure promos)
 * are dropped — there's no target to learn from for those. Also drops cards
 * whose Cardmarket price is known to be wrong: either a detected shared-
 * product-ID mapping bug, or hand-flagged via #/admin/price-audit and
 * recorded in src/data/price-exclusions.json.
 *
 * Usage: node scripts/build-training-data.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artworkGrade, effectiveDexIds, effectiveRarity, mapCardType } from './lib/cardMapping.mjs'
import { correctedTrend, isPriceWrong, unrecognisedReviews } from '../src/logic/priceReview.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'cards')
const SETS_CACHE_DIR = join(HERE, '.cache', 'sets')
const OUT_FILE = join(HERE, 'training-data.json')
const PROMO_STYLES_FILE = join(HERE, '..', 'src', 'data', 'promo-styles.json')
const PRICE_EXCLUSIONS_FILE = join(HERE, '..', 'src', 'data', 'price-exclusions.json')
const ARTWORK_RATINGS_FILE = join(HERE, '..', 'src', 'data', 'artwork-ratings.json')
const TERA_TAGS_FILE = join(HERE, '..', 'src', 'data', 'tera-tags.json')

let promoStyles = {}
try {
  promoStyles = JSON.parse(await readFile(PROMO_STYLES_FILE, 'utf8'))
} catch {
  // no tags yet
}
console.log(`${Object.keys(promoStyles).length} promo cards tagged with a style.`)

let teraTags = {}
try {
  teraTags = JSON.parse(await readFile(TERA_TAGS_FILE, 'utf8'))
} catch {
  // no tags yet
}
console.log(`${Object.keys(teraTags).length} ex cards tagged as Tera.`)

let artworkRatings = {}
try {
  artworkRatings = JSON.parse(await readFile(ARTWORK_RATINGS_FILE, 'utf8'))
} catch {
  // none rated yet
}
console.log(`${Object.keys(artworkRatings).length} cards with a hand-rated artwork grade.`)

// Cards hand-reviewed via #/admin/price-audit: "wrong" means an obviously
// bad Cardmarket price (see the module docstring below and analysis/
// fit_factors.py for why most such errors can't be caught automatically) and
// gets dropped from training; "verified" means the price is real (e.g. hype-
// driven) and stays in — the model just can't explain it from its features.
let priceExclusions = {}
try {
  priceExclusions = JSON.parse(await readFile(PRICE_EXCLUSIONS_FILE, 'utf8'))
} catch {
  // none reviewed yet
}
const badReviews = unrecognisedReviews(priceExclusions)
if (badReviews.length) {
  throw new Error(
    `price-exclusions.json has ${badReviews.length} entr${badReviews.length === 1 ? 'y' : 'ies'} with an ` +
      `unrecognised value: ${badReviews.join(', ')}. Expected "wrong", "verified" or { "corrected": n } ` +
      '— see src/logic/priceReview.js. Refusing to run rather than silently ignoring them.',
  )
}

const wrongCount = Object.values(priceExclusions).filter(isPriceWrong).length
const correctedCount = Object.values(priceExclusions).filter((v) => correctedTrend(v) != null).length
console.log(`${wrongCount} cards flagged with a bad price, ${correctedCount} with a hand-corrected price.`)

// The per-card endpoint's embedded `set` object omits releaseDate, so pull
// it from the separately-cached set details (fetch-all-sets.mjs) instead.
const setFiles = await readdir(SETS_CACHE_DIR)
const releaseDateBySet = new Map()
for (const file of setFiles) {
  const set = JSON.parse(await readFile(join(SETS_CACHE_DIR, file), 'utf8'))
  releaseDateBySet.set(set.id, set.releaseDate ?? null)
}
console.log(`Loaded release dates for ${releaseDateBySet.size} sets.`)

const files = await readdir(CACHE_DIR)
console.log(`Reading ${files.length} cached cards …`)

const rawRows = []
let skippedNoPrice = 0

for (const file of files) {
  const raw = await readFile(join(CACHE_DIR, file), 'utf8')
  const card = JSON.parse(raw)
  // A hand-read correction stands in for the broken source price. Only the
  // trend price is entered by hand, and that's what the model is fitted on —
  // avg30 is set to the same number so this row still passes the price check
  // below rather than being dropped for lacking an average nobody can supply.
  const corrected = correctedTrend(priceExclusions[card.id])
  const avg30 = corrected ?? card.pricing?.cardmarket?.avg30
  if (avg30 == null || avg30 <= 0) {
    skippedNoPrice++
    continue
  }
  rawRows.push({
    id: card.id,
    name: card.name,
    category: card.category ?? 'Pokemon',
    dexIds: effectiveDexIds(card),
    rarity: effectiveRarity(card, promoStyles),
    artwork: artworkGrade(card.id, artworkRatings, promoStyles),
    illustrator: card.illustrator ?? null,
    cardType: mapCardType(card, teraTags),
    setId: card.set?.id ?? null,
    setName: card.set?.name ?? null,
    releaseDate: releaseDateBySet.get(card.set?.id) ?? null,
    avg30,
    trend: corrected ?? card.pricing?.cardmarket?.trend ?? null,
    low: corrected ? null : (card.pricing?.cardmarket?.low ?? null),
    idProduct: card.pricing?.cardmarket?.idProduct ?? null,
  })
}

// Drop cards whose Cardmarket product ID is shared with a DIFFERENT Pokémon
// — a confirmed TCGdex mapping bug (e.g. two unrelated cards pointing at the
// same idProduct), where the price is guaranteed wrong for at least one of
// them and there's no way to tell which. Narrow defense: it only catches
// literal id-sharing across different names, not a card mapped to a
// wrong-but-otherwise-unique product, which looks like an ordinary price and
// isn't statistically detectable (confirmed by hand for one such report —
// see analysis/fit_factors.py's docstring for the caveat this leaves).
const byProduct = new Map()
for (const r of rawRows) {
  if (r.idProduct == null) continue
  if (!byProduct.has(r.idProduct)) byProduct.set(r.idProduct, new Set())
  byProduct.get(r.idProduct).add(r.name)
}
const badProducts = new Set([...byProduct].filter(([, names]) => names.size > 1).map(([id]) => id))
const afterProductFilter = rawRows
  .filter((r) => !(r.idProduct != null && badProducts.has(r.idProduct)))
  .map(({ idProduct, ...rest }) => rest)
console.log(
  `Dropped ${rawRows.length - afterProductFilter.length} cards sharing a Cardmarket product ID with a different Pokémon (${badProducts.size} bad product IDs).`,
)

// Only "wrong" drops a card. A correction keeps it, with the hand-read price
// already substituted above.
const rows = afterProductFilter.filter((r) => !isPriceWrong(priceExclusions[r.id]))
console.log(`Dropped ${afterProductFilter.length - rows.length} cards hand-flagged as having a bad price.`)

rows.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '') || a.id.localeCompare(b.id))

await writeFile(OUT_FILE, JSON.stringify(rows))
console.log(`Wrote ${rows.length} rows to ${OUT_FILE} (${skippedNoPrice} cards skipped, no price).`)
