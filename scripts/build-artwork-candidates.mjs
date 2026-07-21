/**
 * Extracts the cards worth rating for artwork quality — the chase rarities
 * with a unique illustration (illustration rares, special illustration
 * rares, secret/hyper rares, full art trainers) — from the bulk cache into a
 * lean JSON the hidden admin page loads (lazily, so it never bloats the main
 * site bundle). Double Rare and Ultra Rare are excluded: they use a
 * standardized card-frame template, not a unique composition, so only the
 * depicted Pokémon (already a model feature) drives their price.
 *
 * Usage: node scripts/build-artwork-candidates.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isArtworkRateable } from './lib/cardMapping.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'cards')
const SETS_CACHE_DIR = join(HERE, '.cache', 'sets')
const OUT_FILE = join(HERE, '..', 'src', 'data', 'generated', 'artwork-candidates.json')

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
  if (!isArtworkRateable(card.rarity)) continue
  const avg30 = card.pricing?.cardmarket?.avg30
  if (avg30 == null) continue // no real market signal, not useful to rate for calibration
  const meta = setMeta.get(card.set?.id)
  candidates.push({
    id: card.id,
    name: card.name,
    localId: card.localId,
    image: card.image ?? null,
    rarity: card.rarity ?? null,
    setId: card.set?.id ?? null,
    setName: meta?.name ?? card.set?.name ?? null,
    releaseDate: meta?.releaseDate ?? null,
    price: avg30,
  })
}

candidates.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.id.localeCompare(b.id))

await writeFile(OUT_FILE, JSON.stringify(candidates))
console.log(`Wrote ${candidates.length} artwork-rating candidates to ${OUT_FILE}`)
