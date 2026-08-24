/**
 * Rejects implausible trend prices before they reach the site.
 *
 * Cardmarket's feed occasionally reports a fantasy price (a chase card suddenly
 * at €0.02, a €5 card at €900). This guard runs two independent tests against
 * each displayed card's fresh trend price:
 *
 *   1. PLAUSIBILITY — the feed ships its own 30-day average next to the trend,
 *      and the two can only drift so far apart before one of them is broken
 *      (see scripts/lib/priceSanity.mjs). A trend outside 0.35×–3× its own
 *      avg30 is rejected on the spot, no matter how small that day's move was.
 *      This is what catches a price that WALKS to a fantasy value a few percent
 *      a day instead of jumping there — a drift the day-over-day test below is
 *      blind to by construction.
 *
 *   2. SPIKE — a day-over-day move against the committed price is held if it
 *      clears one of two bands: a big-money move (>20% AND >€10 absolute) or a
 *      small-card multiplier (>100% AND >€1 absolute). Requiring a meaningful
 *      euro swing keeps cheap cards drifting a few cents out of the queue.
 *
 * Crucially, plausibility is also applied to the price we are already shipping.
 * If the committed price is the implausible one and the feed has come back in
 * line, the feed wins and the hold is released — otherwise a bad value, once
 * committed, would make every correct price afterwards look like a spike
 * relative to it and could never be dislodged.
 *
 * For the same reason a spike hold is time-boxed: after MAX_HOLD_DAYS the feed
 * has stopped being a spike and started being the market, so it is accepted.
 *
 * When a card is held, the new price is dropped — the cache is patched back to
 * the committed price so the refit, rebake and history all keep the old number.
 * Cards where BOTH the committed and the fresh price are implausible can't be
 * resolved from the feed alone: the fresh price is shipped (a current bad number
 * beats a stale one) and the card is recorded as "unresolved" for a human.
 *
 * Everything held or unresolved lands in src/data/price-guard.json for review on
 * /admin/guarded. Cards already hand-reviewed (any price-exclusions entry) are
 * left untouched — manual decisions win. Set GUARD_DRY=1 to report without
 * writing anything.
 *
 * Runs in the daily pipeline AFTER refresh-prices.mjs (fresh prices in the
 * cache) and BEFORE refresh-training-prices.mjs / ingest.mjs, so both training
 * and the shipped cards see the corrected cache.
 *
 * Usage: node scripts/guard-price-spikes.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { trendPlausibility } from './lib/priceSanity.mjs'

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

// A spike that persists this many days isn't a spike any more — it's the market.
// Only bounds the SPIKE test; an implausible feed value is held for as long as
// it stays implausible, however long that takes.
const MAX_HOLD_DAYS = 3

const DRY = !!process.env.GUARD_DRY

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'))
  } catch {
    return fallback
  }
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))
const exclusions = await readJson(EXCLUSIONS_FILE, {})
const prevGuard = await readJson(GUARD_FILE, {})
const today = new Date().toISOString().slice(0, 10)

const nextGuard = {}
const held = []
const unresolved = []
const releases = []
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
    // The anchor is always the FRESH 30-day average: a held card's committed
    // avg30 is frozen alongside its trend, so reusing that would just re-confirm
    // whatever we decided the day the hold started.
    const avg30 = fresh.pricing?.cardmarket?.avg30 ?? null

    scanned++

    // trendPlausibility returns null for cards too cheap to judge — treat that
    // as "no opinion" and fall through to the day-over-day test.
    const freshOk = trendPlausibility(newTrend, avg30)
    const committedOk = trendPlausibility(oldTrend, avg30)

    const absJump = Math.abs(newTrend - oldTrend)
    const jump = absJump / oldTrend
    const spike = (jump > BIG_PCT && absJump > BIG_ABS) || (jump > MULT_PCT && absJump > MULT_ABS)

    const wasHeld = prevGuard[card.id]
    const since = wasHeld?.since ?? today
    const heldDays = daysBetween(since, today)

    let hold = false
    let reason = null

    if (freshOk === false && committedOk === true) {
      // The feed is the broken one and we have a sane price to fall back on.
      hold = true
      reason = 'implausible-feed'
    } else if (freshOk === false && committedOk === false) {
      // Nothing here is trustworthy. Ship the current number rather than freeze
      // a stale bad one, and put it in front of a human.
      reason = 'unresolved'
    } else if (freshOk === true && committedOk === false) {
      // The value we're shipping is the broken one — take the feed, drop any hold.
      reason = null
    } else if (spike) {
      if (heldDays >= MAX_HOLD_DAYS) {
        releases.push(`${card.id} ${card.name}: feed held at €${newTrend} for ${heldDays}d — accepted`)
      } else {
        hold = true
        reason = 'spike'
      }
    }

    if (hold) {
      // Patch the cache back to the committed price so ingest/training/history
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
        held: true,
        reason,
        kept: Number(oldTrend.toFixed(2)),
        rejected: Number(newTrend.toFixed(2)),
        avg30: avg30 == null ? null : Number(avg30.toFixed(2)),
        since,
        seen: today,
      }
      held.push(
        `${card.id} ${card.name}: kept €${oldTrend} vs feed €${newTrend} ` +
          (reason === 'spike' ? `(${(jump * 100).toFixed(0)}%)` : `(avg30 €${avg30})`),
      )
    } else if (reason === 'unresolved') {
      nextGuard[card.id] = {
        held: false,
        reason,
        kept: Number(newTrend.toFixed(2)),
        rejected: Number(newTrend.toFixed(2)),
        avg30: avg30 == null ? null : Number(avg30.toFixed(2)),
        since,
        seen: today,
      }
      unresolved.push(`${card.id} ${card.name}: €${newTrend} vs avg30 €${avg30} — no sane fallback`)
    }
  }
}

const released = Object.keys(prevGuard).filter((id) => !(id in nextGuard))

if (!DRY) await writeFile(GUARD_FILE, JSON.stringify(nextGuard, null, 1) + '\n')

console.log(
  `Guard${DRY ? ' (dry run)' : ''}: held ${held.length} ` +
    `(implausible vs avg30, or >${BIG_PCT * 100}% & >€${BIG_ABS}, or >${MULT_PCT * 100}% & >€${MULT_ABS}); ` +
    `${unresolved.length} unresolved; released ${released.length}; scanned ${scanned}.`,
)
for (const line of held.slice(0, 40)) console.log('  · ' + line)
if (held.length > 40) console.log(`  … and ${held.length - 40} more`)
for (const line of unresolved) console.log('  ? ' + line)
for (const line of releases) console.log('  ↑ ' + line)
if (released.length) console.log('  released: ' + released.join(', '))
