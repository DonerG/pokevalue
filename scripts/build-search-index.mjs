/**
 * Extracts a lightweight per-card search index (name, number, set, image —
 * no pricing) from the already-ingested generated card data, for the
 * homepage search bar. Lazily loaded on the client so searching ~4,600
 * cards by name/number doesn't need a real search backend, and doesn't cost
 * anything for visitors who never open the search box.
 *
 * Run after ingest.mjs (reads its output, not the raw cache).
 *
 * Usage: node scripts/build-search-index.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const OUT_FILE = join(GENERATED_DIR, 'search-index.json')

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))

const index = []
for (const set of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8'))
  for (const card of cards) {
    index.push({
      id: card.id,
      name: card.name,
      localId: card.localId,
      image: card.image,
      rarity: card.rarity,
      setId: set.id,
      setName: set.name,
    })
  }
}

await writeFile(OUT_FILE, JSON.stringify(index))
console.log(`Wrote ${index.length} cards to the search index at ${OUT_FILE}`)
