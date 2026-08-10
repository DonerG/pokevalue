/**
 * Rejects implausible day-to-day trend-price jumps before they reach the site.
 *
 * Cardmarket's feed occasionally reports a fantasy price for a day (a chase card
 * suddenly at €0.02, or a €5 card at €900). This guard compares each displayed
 * card's freshly fetched trend against the price currently committed (yesterday's
 * shipped value): a move is only held if it clears one of two bands — a big-money
 * move (>20% AND >€10 absolute) or a small-card multiplier (>100% AND >€1
 * absolute). Requiring a meaningful euro swing keeps cheap cards drifting a few
 * cents out of the review queue. When held, the new price is dropped — the cache
 * is patched back to the old price so the refit, rebake and history all keep the
 * old number — and the card is recorded in src/data/price-guard.json for review
 * on /admin/guarded.
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

// Hold a day-over-day move only if it clears one of two bands. Each needs both a
// percentage jump AND a euro jump, so cheap cents-drift never gets flagged.
const BIG_PCT = 0.2 // band A: >20% …
const BIG_ABS = 10 // … AND >€10 absolute
const MULT_PCT = 1 // band B: >100% …
const MULT_ABS = 1 // … AND >€1 absolute
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
    if (oldTrend == null || oldTrend <= 0) continue

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
    const absJump = Math.abs(newTrend - oldTrend)
    const jump = absJump / oldTrend
    // Flag only big-money moves or small-card multipliers; otherwise let the new
    // price through (and, if it was held, this releases it).
    const flagged = (jump > BIG_PCT && absJump > BIG_ABS) || (jump > MULT_PCT && absJump > MULT_ABS)
    if (!flagged) continue

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
  `Guard${DRY ? ' (dry run)' : ''}: held ${held.length} spike(s) ` +
    `(>${BIG_PCT * 100}% & >€${BIG_ABS}, or >${MULT_PCT * 100}% & >€${MULT_ABS}); ` +
    `released ${released.length}; scanned ${scanned}.`,
)
for (const line of held.slice(0, 40)) console.log('  · ' + line)
if (held.length > 40) console.log(`  … and ${held.length - 40} more`)
if (released.length) console.log('  released: ' + released.join(', '))
