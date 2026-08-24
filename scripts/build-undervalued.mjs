/**
 * Precomputes the "undervalued picks" list shown on /undervalued, so the page
 * loads one small file instead of scanning all 4,393 cards in the browser.
 *
 * A card qualifies when its shipped fair price is above the market trend by more
 * than the site's threshold AND the market price is at least €1 (below that a
 * one-cent wobble reads as a huge percentage but means nothing) AND its trend
 * price is plausible against its own 30-day average (a broken low price would
 * otherwise top the list precisely because it is broken). Each entry
 * carries the three views' verdicts (for the dots + unanimous filter), the
 * percentage upside AND the absolute euro gap to fair — the page sorts by
 * either and can slice to the top 100. Every qualifying card is written, not a
 * fixed top-N, so re-sorting by euro gap in the browser still sees the whole
 * field (a card can be a big euro gap without a big percentage, and vice versa).
 *
 * Run after ingest. Usage: node scripts/build-undervalued.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verdict, DEFAULT_THRESHOLDS } from '../src/logic/verdict.js'
import { isImplausibleTrend } from './lib/priceSanity.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const CONFIG = { thresholds: DEFAULT_THRESHOLDS }
const MIN_MARKET = 1
const KIND = { undervalued: 'u', fair: 'f', overvalued: 'o' }

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))
const picks = []

for (const set of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8'))
  for (const c of cards) {
    const market = c.market?.trend
    if (market == null || market < MIN_MARKET) continue
    // A trend price that has drifted off its own 30-day average is a broken
    // feed value, and a broken LOW one reads as a huge bargain — exactly the
    // card this list would push hardest. Leave those out; /admin/guarded has
    // them queued for review.
    if (isImplausibleTrend(market, c.market?.avg30)) continue
    const headline = verdict(market, c.baseValue, CONFIG)
    if (!headline || headline.kind !== 'undervalued') continue
    const views = ['broad', 'standard', 'local'].map((v) => KIND[verdict(market, c.fairs[v], CONFIG)?.kind] ?? 'f')
    picks.push({
      id: c.id,
      name: c.name,
      localId: c.localId,
      setName: set.name,
      image: c.image,
      market,
      fair: Number(c.baseValue.toFixed(2)),
      upside: Number((headline.deviation * 100).toFixed(0)),
      diff: Number((c.baseValue - market).toFixed(2)),
      views,
      unanimous: views.every((v) => v === 'u'),
    })
  }
}

picks.sort((a, b) => b.upside - a.upside)
await writeFile(join(GENERATED_DIR, 'undervalued.json'), JSON.stringify(picks))
console.log(`Wrote ${picks.length} undervalued picks (${picks.filter((p) => p.unanimous).length} unanimous), each with % upside + € gap.`)
