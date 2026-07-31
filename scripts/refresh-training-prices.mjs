/**
 * Updates the DISPLAYED cards' prices inside the committed training-data.json
 * from the freshly refreshed cache, so a refit reflects today's market — the
 * "fair is live too" design — WITHOUT rebuilding the whole training set.
 *
 * Why not just re-run build-training-data.mjs in CI? Because that reads the
 * ~19,000-card cache, which is gitignored and therefore absent on a fresh
 * checkout. refresh-prices only refetches the ~4,400 displayed cards, so a full
 * rebuild there would collapse the model from 170 sets to 22. Instead we keep
 * the committed rows (their historical prices are stable, down-weighted anchors)
 * and refresh only the displayed rows' prices in place — the only prices that
 * move day to day and the only ones the site shows.
 *
 * Mirrors build-training-data.mjs's price logic exactly (avg30/trend/low +
 * hand corrections). Rows are neither added nor removed here; a card whose
 * fresh price is missing keeps its previous one rather than being dropped.
 *
 * Usage: node scripts/refresh-training-prices.mjs   (after refresh-prices.mjs)
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { correctedTrend } from '../src/logic/priceReview.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '.cache', 'cards')
const TRAINING_DATA = join(HERE, 'training-data.json')
const PRICE_EXCLUSIONS = join(HERE, '..', 'src', 'data', 'price-exclusions.json')

const rows = JSON.parse(await readFile(TRAINING_DATA, 'utf8'))
const byId = new Map(rows.map((r) => [r.id, r]))

let exclusions = {}
try {
  exclusions = JSON.parse(await readFile(PRICE_EXCLUSIONS, 'utf8'))
} catch {
  // none
}

if (!existsSync(CACHE_DIR)) {
  console.log('No cache to patch from — skipping.')
  process.exit(0)
}

const files = await readdir(CACHE_DIR)
let updated = 0
for (const file of files) {
  let card
  try {
    card = JSON.parse(await readFile(join(CACHE_DIR, file), 'utf8'))
  } catch {
    continue
  }
  const row = byId.get(card.id)
  if (!row) continue // training-only cards, or a dropped one — leave the set as-is

  const corrected = correctedTrend(exclusions[card.id])
  if (corrected != null) {
    // Hand-pinned price — never overwrite from the feed.
    row.avg30 = corrected
    row.trend = corrected
    row.low = null
    updated++
  } else {
    const cm = card.pricing?.cardmarket
    // Only refresh when the fresh price is usable (same gate as the build);
    // otherwise keep the row's previous price rather than blanking it.
    if (cm && cm.avg30 != null && cm.avg30 > 0) {
      row.avg30 = cm.avg30
      row.trend = cm.trend ?? null
      row.low = cm.low ?? null
      updated++
    }
  }
}

await writeFile(TRAINING_DATA, JSON.stringify(rows))
console.log(`Refreshed ${updated} displayed rows in training-data.json (${rows.length} rows total).`)
