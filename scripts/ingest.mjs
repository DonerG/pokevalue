/**
 * Loads sets + cards and writes them as JSON to src/data/generated/. Every
 * card's fair-value base price and per-factor breakdown (Pokémon, rarity,
 * illustrator, set, card type) come from analysis/factors.json — the fitted
 * ridge regression, see analysis/fit_factors.py — not a hand-tuned formula.
 * Prefers the local bulk cache (scripts/.cache/, populated by
 * fetch-all-cards.mjs / fetch-all-sets.mjs) when available, falling back to
 * a live TCGdex fetch for anything not cached yet.
 *
 * Run analysis/fit_factors.py first (or after refreshing training data) so
 * analysis/factors.json is up to date before ingesting.
 *
 * Usage:  node scripts/ingest.mjs me05 me04
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapCardType } from './lib/cardMapping.mjs'
import { computeCardPricing } from './lib/factors.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, '..', 'src', 'data', 'generated')
const CACHE_CARDS_DIR = join(HERE, '.cache', 'cards')
const CACHE_SETS_DIR = join(HERE, '.cache', 'sets')
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

async function loadSet(setId) {
  const cachedPath = join(CACHE_SETS_DIR, `${setId}.json`)
  if (existsSync(cachedPath)) return JSON.parse(await readFile(cachedPath, 'utf8'))
  return fetchJson(`${API}/sets/${setId}`)
}

async function loadCard(cardId) {
  const cachedPath = join(CACHE_CARDS_DIR, `${encodeURIComponent(cardId)}.json`)
  if (existsSync(cachedPath)) return JSON.parse(await readFile(cachedPath, 'utf8'))
  return fetchJson(`${API}/cards/${cardId}`)
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
  const set = await loadSet(setId)
  const cardBriefs = set.cards ?? []
  console.log(`  ${set.name} (${set.releaseDate}), ${cardBriefs.length} cards`)

  let done = 0
  const cards = await mapLimited(cardBriefs, CONCURRENCY, async (brief) => {
    const card = await loadCard(brief.id)
    done++
    if (done % 25 === 0) console.log(`  … ${done}/${cardBriefs.length}`)

    const dexIds = card.dexId ?? []
    const cm = card.pricing?.cardmarket
    const { baseValue, breakdown } = computeCardPricing(card)
    return {
      id: card.id,
      localId: String(card.localId),
      name: card.name,
      category: card.category ?? 'Pokemon',
      rarity: card.rarity ?? null,
      illustrator: card.illustrator ?? null,
      cardType: mapCardType(card),
      dexIds,
      image: card.image ?? null,
      market: cm
        ? { trend: cm.trend ?? null, avg30: cm.avg30 ?? null, low: cm.low ?? null, updated: cm.updated ?? null }
        : null,
      baseValue,
      factors: breakdown,
    }
  })

  cards.sort((a, b) => Number(a.localId) - Number(b.localId) || a.localId.localeCompare(b.localId))

  await writeFile(join(OUT_DIR, `cards-${setId}.json`), JSON.stringify(cards, null, 1))
  return {
    meta: {
      id: setId,
      name: set.name,
      serie: set.serie?.name ?? null,
      releaseDate: set.releaseDate,
      logo: set.logo ?? null,
      symbol: set.symbol ?? null,
      cardCount: cards.length,
      withMarket: cards.filter((c) => c.market?.trend != null).length,
    },
    cards,
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

const allBaseValues = []
for (const setId of setIds) {
  const { meta, cards } = await ingestSet(setId)
  existing = existing.filter((s) => s.id !== meta.id)
  existing.push(meta)
  for (const c of cards) allBaseValues.push(c.baseValue)
  console.log(`  ✔ ${meta.name}: ${meta.cardCount} cards, ${meta.withMarket} with a market price`)
}

existing.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
await writeFile(join(OUT_DIR, 'sets.json'), JSON.stringify(existing, null, 1))

// Re-derive the score-normalization range across every set we currently ship
// (not just the ones touched this run), so a partial re-ingest doesn't skew it.
const allCardFiles = existing.map((s) => join(OUT_DIR, `cards-${s.id}.json`))
const allValues = []
for (const f of allCardFiles) {
  try {
    const cards = JSON.parse(await readFile(f, 'utf8'))
    for (const c of cards) allValues.push(c.baseValue)
  } catch {
    // set file missing (shouldn't happen), skip
  }
}
const pricingMeta = {
  minBaseValue: Math.min(...allValues),
  maxBaseValue: Math.max(...allValues),
}
await writeFile(join(OUT_DIR, 'pricing-meta.json'), JSON.stringify(pricingMeta, null, 1))

console.log(`Done. ${existing.length} set(s) in sets.json.`)
console.log(`Base value range across ${allValues.length} displayed cards: €${pricingMeta.minBaseValue.toFixed(3)} – €${pricingMeta.maxBaseValue.toFixed(2)}`)
