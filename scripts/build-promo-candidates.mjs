/**
 * Extracts Promo-rarity Pokémon cards into a lean JSON for the hidden
 * "#/admin/promo-style" page — TCGdex has no field distinguishing an
 * extended-art "Art Rare" style promo from a plain framed one, even though
 * it swings the price a lot (verified: two Promo cards, same rarity, wildly
 * different prices, no structural difference in the data). Tagging these by
 * eye gives the regression a real Promo-style factor to learn once enough
 * cards are tagged.
 *
 * Usage: node scripts/build-promo-candidates.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'cards')
const SETS_CACHE_DIR = join(HERE, '.cache', 'sets')
const OUT_FILE = join(HERE, '..', 'src', 'data', 'generated', 'promo-candidates.json')

const setFiles = await readdir(SETS_CACHE_DIR)
const setMeta = new Map()
for (const file of setFiles) {
  const set = JSON.parse(await readFile(join(SETS_CACHE_DIR, file), 'utf8'))
  setMeta.set(set.id, { releaseDate: set.releaseDate ?? null, name: set.name })
}

const files = await readdir(CACHE_DIR)
const candidates = []

for (const file of files) {
  const card = JSON.parse(await readFile(join(CACHE_DIR, file), 'utf8'))
  if (card.rarity !== 'Promo' || card.category !== 'Pokemon') continue
  const avg30 = card.pricing?.cardmarket?.avg30
  if (avg30 == null) continue
  const meta = setMeta.get(card.set?.id)
  candidates.push({
    id: card.id,
    name: card.name,
    localId: card.localId,
    image: card.image ?? null,
    setId: card.set?.id ?? null,
    setName: meta?.name ?? card.set?.name ?? null,
    releaseDate: meta?.releaseDate ?? null,
    price: avg30,
  })
}

candidates.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.id.localeCompare(b.id))

await writeFile(OUT_FILE, JSON.stringify(candidates))
console.log(`Wrote ${candidates.length} promo candidates to ${OUT_FILE}`)
