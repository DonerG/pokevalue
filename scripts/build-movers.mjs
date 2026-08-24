/**
 * Precomputes the daily "biggest movers": cards whose valuation shifted the most
 * since the previous snapshot — the top 5 that became MORE undervalued and the
 * top 5 that became MORE overvalued. Reads the per-set price history
 * (public/history/<set>.json) written by snapshot-prices.mjs, so it needs at
 * least two days of history to produce anything; before that it writes an empty
 * report and the page simply doesn't show the section.
 *
 * "Upside" is (fair − trend) / trend at each snapshot; the mover is the change
 * in that from the previous day to the latest. Restricted to cards trading at
 * ≥ €1 so a one-cent wobble on a bulk card doesn't dominate, and to
 * cards whose trend price is plausible against their own 30-day average, so a
 * broken feed value doesn't headline the page as the day's biggest move.
 *
 * Run after snapshot-prices. Usage: node scripts/build-movers.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isImplausibleTrend } from './lib/priceSanity.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const HISTORY_DIR = join(HERE, '..', 'public', 'history')
const MIN_MARKET = 1

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))
const moves = []
let latestDate = '' // the date of the newest snapshot the move is measured to

for (const set of sets) {
  const historyFile = join(HISTORY_DIR, `${set.id}.json`)
  if (!existsSync(historyFile)) continue
  const history = JSON.parse(await readFile(historyFile, 'utf8'))
  const cards = new Map(
    JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8')).map((c) => [c.id, c]),
  )

  for (const [id, h] of Object.entries(history)) {
    const n = h.d.length
    if (n < 2) continue
    const t1 = h.t[n - 1]
    const f1 = h.f[n - 1]
    const t0 = h.t[n - 2]
    const f0 = h.f[n - 2]
    if (h.d[n - 1] > latestDate) latestDate = h.d[n - 1]
    if (t1 == null || t0 == null || t1 < MIN_MARKET) continue
    // Skip cards whose current trend price is implausible against its own
    // 30-day average — a broken price produces the biggest "move" of the day
    // every time, which is how bad feed data ends up headlining the homepage.
    if (isImplausibleTrend(t1, cards.get(id)?.market?.avg30)) continue
    const up1 = (f1 - t1) / t1
    const up0 = (f0 - t0) / t0
    const delta = up1 - up0
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.02) continue // ignore noise
    const card = cards.get(id)
    if (!card) continue
    moves.push({
      id,
      name: card.name,
      localId: card.localId,
      setName: set.name,
      image: card.image,
      market: t1,
      fair: Number(f1.toFixed(2)),
      upside: Number((up1 * 100).toFixed(0)),
      delta: Number((delta * 100).toFixed(0)),
    })
  }
}

// delta > 0 → more undervalued (upside grew); delta < 0 → more overvalued.
const up = [...moves].sort((a, b) => b.delta - a.delta).slice(0, 5)
const down = [...moves].sort((a, b) => a.delta - b.delta).slice(0, 5)
const asOf = latestDate || new Date().toISOString().slice(0, 10)

await writeFile(join(GENERATED_DIR, 'movers.json'), JSON.stringify({ asOf, up, down }))
console.log(`Wrote movers for ${asOf}: ${up.length} more-undervalued, ${down.length} more-overvalued (from ${moves.length} moved cards).`)
