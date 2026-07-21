/**
 * Loads sets + cards from TCGdex (api.tcgdex.net) and writes them as JSON
 * to src/data/generated/. For every card, the default factors (rarity, era,
 * popularity, supply) are preset.
 *
 * Usage:  node scripts/ingest.mjs me05 me04
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapEra, mapRarity, mapSupply, popularityTier } from './lib/cardMapping.mjs'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'generated')
const API = 'https://api.tcgdex.net/v2/en'
const CONCURRENCY = 8

// ---------- API helpers ----------

async function fetchJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      console.warn(`  ${url} → HTTP ${res.status} (attempt ${i + 1}/${tries})`)
    } catch (e) {
      console.warn(`  ${url} → ${e.message} (attempt ${i + 1}/${tries})`)
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  throw new Error(`Task failed: ${url}`)
}

async function mapLimited(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ---------- Ingest ----------

async function ingestSet(setId) {
  console.log(`Loading set ${setId} …`)
  const set = await fetchJson(`${API}/sets/${setId}`)
  const cardBriefs = set.cards ?? []
  console.log(`  ${set.name} (${set.releaseDate}), ${cardBriefs.length} cards`)

  let done = 0
  const cards = await mapLimited(cardBriefs, CONCURRENCY, async (brief) => {
    const card = await fetchJson(`${API}/cards/${brief.id}`)
    done++
    if (done % 25 === 0) console.log(`  … ${done}/${cardBriefs.length}`)

    const era = mapEra(set.releaseDate)
    const rarityId = mapRarity(card.rarity)
    const dexIds = card.dexId ?? []
    const cm = card.pricing?.cardmarket
    return {
      id: card.id,
      localId: String(card.localId),
      name: card.name,
      category: card.category ?? 'Pokemon',
      rarity: card.rarity ?? null,
      dexIds,
      image: card.image ?? null,
      market: cm
        ? { trend: cm.trend ?? null, avg30: cm.avg30 ?? null, low: cm.low ?? null, updated: cm.updated ?? null }
        : null,
      preset: {
        rarity: rarityId,
        era,
        popularity: popularityTier(dexIds),
        supply: mapSupply(era, rarityId),
      },
    }
  })

  cards.sort((a, b) => Number(a.localId) - Number(b.localId) || a.localId.localeCompare(b.localId))

  await writeFile(join(OUT_DIR, `cards-${setId}.json`), JSON.stringify(cards, null, 1))
  return {
    id: setId,
    name: set.name,
    serie: set.serie?.name ?? null,
    releaseDate: set.releaseDate,
    logo: set.logo ?? null,
    symbol: set.symbol ?? null,
    cardCount: cards.length,
    withMarket: cards.filter((c) => c.market?.trend != null).length,
  }
}

const setIds = process.argv.slice(2)
if (setIds.length === 0) {
  console.error('Usage: node scripts/ingest.mjs <setId> [<setId> …]   (e.g. me05 me04)')
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })

// Read the existing sets.json and add/replace new sets
let existing = []
try {
  existing = JSON.parse(await readFile(join(OUT_DIR, 'sets.json'), 'utf8'))
} catch {
  // no sets.json yet
}

for (const setId of setIds) {
  const meta = await ingestSet(setId)
  existing = existing.filter((s) => s.id !== meta.id)
  existing.push(meta)
  console.log(`  ✔ ${meta.name}: ${meta.cardCount} cards, ${meta.withMarket} with a market price`)
}

existing.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
await writeFile(join(OUT_DIR, 'sets.json'), JSON.stringify(existing, null, 1))
console.log(`Done. ${existing.length} set(s) in sets.json.`)
