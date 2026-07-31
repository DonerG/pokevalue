/**
 * Re-fetches the DISPLAYED cards' detail from TCGdex and overwrites their cache
 * files, so a following `ingest.mjs` run bakes fresh Cardmarket prices. Unlike
 * fetch-all-cards.mjs (which skips anything already cached, for the one-time
 * bulk pull), this deliberately overwrites — refreshing the price is the point.
 *
 * Hand-corrected cards are refreshed here too: ingest keeps their manual price
 * for display, but the fresh raw price is what the admin corrections list uses
 * to show whether Cardmarket has since fixed itself.
 *
 * Usage: node scripts/refresh-prices.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'cards')
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const API = 'https://api.tcgdex.net/v2/en'
const CONCURRENCY = 16

async function fetchJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      if (res.status === 404) return null
    } catch {
      // network hiccup — retry
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
  }
  return null
}

async function mapLimited(items, limit, fn) {
  let next = 0
  let done = 0
  let failed = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      const ok = await fn(items[i])
      if (!ok) failed++
      done++
      if (done % 250 === 0) console.log(`  … ${done}/${items.length} (${failed} failed)`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return { done, failed }
}

// The cache is gitignored, so on a fresh checkout (e.g. CI) it doesn't exist
// yet — create it, or the very first writeFile below would crash the run.
await mkdir(CACHE_DIR, { recursive: true })

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))
const ids = []
for (const s of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${s.id}.json`), 'utf8'))
  for (const c of cards) ids.push(c.id)
}
console.log(`Refreshing ${ids.length} displayed cards from ${sets.length} sets …`)

const { failed } = await mapLimited(ids, CONCURRENCY, async (id) => {
  try {
    const detail = await fetchJson(`${API}/cards/${encodeURIComponent(id)}`)
    if (!detail) return false
    await writeFile(join(CACHE_DIR, `${encodeURIComponent(id)}.json`), JSON.stringify(detail))
    return true
  } catch {
    // One card failing (network, write) must not abort the whole refresh.
    return false
  }
})
console.log(`Done. ${ids.length - failed} refreshed, ${failed} failed${failed ? ' (re-run to retry)' : ''}.`)
