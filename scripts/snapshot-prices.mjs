/**
 * Appends today's trend + fair price for every displayed card to a per-set
 * history file in public/history/<setId>.json, so the card page can draw how
 * the two prices moved over time. Run AFTER ingest (it reads the freshly baked
 * cards-*.json). Idempotent per day: a second run on the same date overwrites
 * that day's point instead of duplicating it, so re-runs are safe.
 *
 * Per-set files (not per-card) on purpose: 22 small files that grow by one
 * point per card per day keep the git history — and Vercel's clone on every
 * deploy — cheap, where 4,393 daily-changed files would not.
 *
 * A hand-corrected card records its MANUAL price here (that's what market.trend
 * is for it), so pinned prices show as a flat line until you change them — the
 * daily refresh never overwrites them.
 *
 * Shape: { "<cardId>": { d: ["2026-07-31", …], t: [trend|null, …], f: [fair, …] } }
 *
 * Usage: node scripts/snapshot-prices.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const HISTORY_DIR = join(HERE, '..', 'public', 'history')

const today = new Date().toISOString().slice(0, 10)

await mkdir(HISTORY_DIR, { recursive: true })
const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))

let points = 0
for (const set of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8'))
  const file = join(HISTORY_DIR, `${set.id}.json`)
  const history = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : {}

  for (const card of cards) {
    const entry = history[card.id] ?? { d: [], t: [], f: [] }
    const trend = card.market?.trend ?? null
    const fair = Number(card.baseValue.toFixed(2))
    const last = entry.d.length - 1
    if (last >= 0 && entry.d[last] === today) {
      // Same day already recorded — overwrite it (safe re-run).
      entry.t[last] = trend
      entry.f[last] = fair
    } else {
      entry.d.push(today)
      entry.t.push(trend)
      entry.f.push(fair)
    }
    history[card.id] = entry
    points++
  }

  await writeFile(file, JSON.stringify(history))
}

console.log(`Snapshot ${today}: ${points} card points across ${sets.length} sets → public/history/`)
