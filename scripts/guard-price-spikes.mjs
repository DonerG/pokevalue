/**
 * Rejects implausible day-to-day trend-price jumps before they reach the site.
 *
 * Cardmarket's feed occasionally reports a fantasy price for a day (a chase card
 * suddenly at €0.02, or a €5 card at €900). This guard compares each displayed
 * card's freshly fetched trend against the price currently committed (yesterday's
 * shipped value): if it moved by more than THRESHOLD and the established price is
 * over MIN_MARKET €, the new price is dropped — the cache is patched back to the
 * old price so the refit, rebake and history all keep the old number — and the
 * card is recorded in src/data/price-guard.json for review on /admin/guarded.
 *
 * Runs in the daily pipeline AFTER refresh-prices.mjs (fresh prices in the
 * cache) and BEFORE refresh-training-prices.mjs / ingest.mjs, so both training
 * and the shipped cards see the corrected cache.
 *
 * A hold persists day to day: the committed price stays the old one, so the next
 * run compares the still-spiked feed against it and holds again — until the feed
 * returns within THRESHOLD (auto-released) or the card is marked verified/wrong/
 * corrected by hand (in price-exclusions.json, which this guard always skips).
 *
 * Cards already hand-reviewed (any price-exclusions entry) are left untouched —
 * manual decisions win. Set GUARD_DRY=1 to report without writing anything.
 *
 * Usage: node scripts/guard-price-spikes.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const CACHE_DIR = join(HERE, '.cache', 'cards')
const EXCLUSIONS_FILE = join(HERE, '..', 'src', 'data', 'price-exclusions.json')
const GUARD_FILE = join(HERE, '..', 'src', 'data', 'price-guard.json')

const THRESHOLD = 0.2 // >20% day-over-day move
const MIN_MARKET = 1 // only guard cards whose established price is over €1
const DRY = !!process.env.GUARD_DRY

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'))
  } catch {
    return fallback
  }
}

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))
const exclusions = await readJson(EXCLUSIONS_FILE, {})
const prevGuard = await readJson(GUARD_FILE, {})
const today = new Date().toISOString().slice(0, 10)

const nextGuard = {}
const held = []
let scanned = 0

for (const set of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8'))
  for (const card of cards) {
    // Manual review always wins — never guard a card the admin has touched.
    if (exclusions[card.id] != null) continue
    const old = card.market // committed = the price we shipped last run
    const oldTrend = old?.trend
    if (oldTrend == null || oldTrend <= MIN_MARKET) continue

    const cachePath = join(CACHE_DIR, `${encodeURIComponent(card.id)}.json`)
    if (!existsSync(cachePath)) continue
    let fresh
    try {
      fresh = JSON.parse(await readFile(cachePath, 'utf8'))
    } catch {
      continue
    }
    const newTrend = fresh.pricing?.cardmarket?.trend
    if (newTrend == null) continue

    scanned++
    const jump = Math.abs(newTrend - oldTrend) / oldTrend
    if (jump <= THRESHOLD) continue // within range → let the new price through (and, if it was held, this releases it)

    // Hold: patch the cache back to the committed price so ingest/training/history
    // all keep it, and record the rejected price for review.
    if (!DRY) {
      fresh.pricing = fresh.pricing || {}
      fresh.pricing.cardmarket = {
        trend: old.trend,
        avg30: old.avg30 ?? null,
        low: old.low ?? null,
        updated: old.updated ?? null,
      }
      await writeFile(cachePath, JSON.stringify(fresh))
    }
    nextGuard[card.id] = {
      kept: Number(oldTrend.toFixed(2)),
      rejected: Number(newTrend.toFixed(2)),
      since: prevGuard[card.id]?.since ?? today,
      seen: today,
    }
    held.push(`${card.id} ${card.name}: kept €${oldTrend} vs feed €${newTrend} (${(jump * 100).toFixed(0)}%)`)
  }
}

const released = Object.keys(prevGuard).filter((id) => !(id in nextGuard))

if (!DRY) await writeFile(GUARD_FILE, JSON.stringify(nextGuard, null, 1) + '\n')

console.log(
  `Guard${DRY ? ' (dry run)' : ''}: held ${held.length} spike(s) (>${THRESHOLD * 100}% on market >€${MIN_MARKET}); ` +
    `released ${released.length}; scanned ${scanned}.`,
)
for (const line of held.slice(0, 40)) console.log('  · ' + line)
if (held.length > 40) console.log(`  … and ${held.length - 40} more`)
if (released.length) console.log('  released: ' + released.join(', '))
