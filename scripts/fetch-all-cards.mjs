/**
 * Downloads full card detail (rarity, dex IDs, Cardmarket pricing, set/release
 * date) for every English-language Pokémon card on TCGdex, caching each card
 * as its own file so the run is resumable and cheap to repeat.
 *
 * This is a one-time bulk pull to build the training dataset for the pricing
 * model — separate from scripts/ingest.mjs, which imports individual sets for
 * display in the app.
 *
 * Usage: node scripts/fetch-all-cards.mjs
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'cards')
const API = 'https://api.tcgdex.net/v2/en'
const CONCURRENCY = 16

async function fetchJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      if (res.status === 404) return null
      console.warn(`  ${url} → HTTP ${res.status} (attempt ${i + 1}/${tries})`)
    } catch (e) {
      console.warn(`  ${url} → ${e.message} (attempt ${i + 1}/${tries})`)
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
  }
  return null
}

function cacheFile(cardId) {
  return join(CACHE_DIR, `${encodeURIComponent(cardId)}.json`)
}

async function mapLimited(items, limit, fn) {
  let next = 0
  let done = 0
  let failed = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      try {
        const ok = await fn(items[i], i)
        if (!ok) failed++
      } catch {
        failed++
      }
      done++
      if (done % 500 === 0) console.log(`  … ${done}/${items.length} (${failed} failed so far)`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return { done, failed }
}

await mkdir(CACHE_DIR, { recursive: true })

console.log('Fetching the full English card list …')
const briefs = await fetchJson(`${API}/cards`)
if (!briefs) {
  console.error('Could not fetch the card list.')
  process.exit(1)
}
console.log(`${briefs.length} cards total.`)

const already = new Set(await readdir(CACHE_DIR))
const todo = briefs.filter((b) => !already.has(`${encodeURIComponent(b.id)}.json`))
console.log(`${briefs.length - todo.length} already cached, ${todo.length} to fetch.`)

if (todo.length > 0) {
  const { failed } = await mapLimited(todo, CONCURRENCY, async (brief) => {
    const detail = await fetchJson(`${API}/cards/${encodeURIComponent(brief.id)}`)
    if (!detail) return false
    await writeFile(cacheFile(brief.id), JSON.stringify(detail))
    return true
  })
  console.log(`Done. ${todo.length - failed} fetched, ${failed} failed (re-run to retry those).`)
} else {
  console.log('Nothing new to fetch.')
}

const finalCount = (await readdir(CACHE_DIR)).length
console.log(`Cache now holds ${finalCount}/${briefs.length} cards at ${CACHE_DIR}`)
if (finalCount < briefs.length) {
  console.log('Run this script again to retry the ones that failed.')
}
