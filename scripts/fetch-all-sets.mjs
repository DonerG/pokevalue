/**
 * Downloads set metadata (release date, series) for every English set on
 * TCGdex — the per-card detail endpoint doesn't include release dates, so
 * this fills that gap for build-training-data.mjs. Cached like
 * fetch-all-cards.mjs so re-runs are cheap.
 *
 * Usage: node scripts/fetch-all-sets.mjs
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'sets')
const API = 'https://api.tcgdex.net/v2/en'
const CONCURRENCY = 12

async function fetchJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      console.warn(`  ${url} → HTTP ${res.status} (attempt ${i + 1}/${tries})`)
    } catch (e) {
      console.warn(`  ${url} → ${e.message} (attempt ${i + 1}/${tries})`)
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
  }
  return null
}

await mkdir(CACHE_DIR, { recursive: true })

const briefs = await fetchJson(`${API}/sets`)
console.log(`${briefs.length} sets total.`)

const already = new Set(await readdir(CACHE_DIR))
const todo = briefs.filter((b) => !already.has(`${b.id}.json`))
console.log(`${briefs.length - todo.length} already cached, ${todo.length} to fetch.`)

let next = 0
let failed = 0
async function worker() {
  while (next < todo.length) {
    const brief = todo[next++]
    const detail = await fetchJson(`${API}/sets/${brief.id}`)
    if (!detail) {
      failed++
      continue
    }
    await writeFile(join(CACHE_DIR, `${brief.id}.json`), JSON.stringify(detail))
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker))

console.log(`Done. ${todo.length - failed} fetched, ${failed} failed.`)
