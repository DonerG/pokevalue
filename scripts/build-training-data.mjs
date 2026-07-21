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

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'cards')
const SETS_CACHE_DIR = join(HERE, '.cache', 'sets')
const OUT_FILE = join(HERE, 'training-data.json')

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

const rows = []
let skippedNoPrice = 0

for (const file of files) {
  const raw = await readFile(join(CACHE_DIR, file), 'utf8')
  const card = JSON.parse(raw)
  const avg30 = card.pricing?.cardmarket?.avg30
  if (avg30 == null || avg30 <= 0) {
    skippedNoPrice++
    continue
  }
  rows.push({
    id: card.id,
    name: card.name,
    category: card.category ?? 'Pokemon',
    dexIds: card.dexId ?? [],
    rarity: card.rarity ?? null,
    setId: card.set?.id ?? null,
    setName: card.set?.name ?? null,
    releaseDate: releaseDateBySet.get(card.set?.id) ?? null,
    avg30,
    trend: card.pricing?.cardmarket?.trend ?? null,
    low: card.pricing?.cardmarket?.low ?? null,
  })
}

rows.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '') || a.id.localeCompare(b.id))

await writeFile(OUT_FILE, JSON.stringify(rows))
console.log(`Wrote ${rows.length} rows to ${OUT_FILE} (${skippedNoPrice} cards skipped, no price).`)
