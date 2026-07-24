/**
 * Reads the raw per-card cache from fetch-all-cards.mjs and distills it into
 * a compact training dataset: one row per card that has a real Cardmarket
 * price, with just the fields the pricing model needs. Cards without a price
 * (mostly digital-only "TCG Pocket" cards and a handful of obscure promos)
 * are dropped — there's no target to learn from for those.
 *
 * Usage: node scripts/build-training-data.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { effectiveRarity, mapCardType } from './lib/cardMapping.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'cards')
const SETS_CACHE_DIR = join(HERE, '.cache', 'sets')
const OUT_FILE = join(HERE, 'training-data.json')
const PROMO_STYLES_FILE = join(HERE, '..', 'src', 'data', 'promo-styles.json')

let promoStyles = {}
try {
  promoStyles = JSON.parse(await readFile(PROMO_STYLES_FILE, 'utf8'))
} catch {
  // no tags yet
}
console.log(`${Object.keys(promoStyles).length} promo cards tagged with a style.`)

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
  const avg30 = card.pricing?.cardmarket?.avg30
  if (avg30 == null || avg30 <= 0) {
    skippedNoPrice++
    continue
  }
  rawRows.push({
    id: card.id,
    name: card.name,
    category: card.category ?? 'Pokemon',
    dexIds: card.dexId ?? [],
    rarity: effectiveRarity(card, promoStyles),
    illustrator: card.illustrator ?? null,
    cardType: mapCardType(card),
    setId: card.set?.id ?? null,
    setName: card.set?.name ?? null,
    releaseDate: releaseDateBySet.get(card.set?.id) ?? null,
    avg30,
    trend: card.pricing?.cardmarket?.trend ?? null,
    low: card.pricing?.cardmarket?.low ?? null,
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
const rows = rawRows
  .filter((r) => !(r.idProduct != null && badProducts.has(r.idProduct)))
  .map(({ idProduct, ...rest }) => rest)
console.log(
  `Dropped ${rawRows.length - rows.length} cards sharing a Cardmarket product ID with a different Pokémon (${badProducts.size} bad product IDs).`,
)

rows.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '') || a.id.localeCompare(b.id))

await writeFile(OUT_FILE, JSON.stringify(rows))
console.log(`Wrote ${rows.length} rows to ${OUT_FILE} (${skippedNoPrice} cards skipped, no price).`)
