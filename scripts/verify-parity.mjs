/**
 * Guards the one structural risk in this pipeline: the price a card is fitted
 * with (analysis/fit_factors.py, Python) and the price baked into the site
 * (scripts/lib/factors.mjs, JS) are computed by two separate implementations
 * that must agree. eraBucket/rarityTier are duplicated in both languages, and
 * a factor added on one side and forgotten on the other would silently ship
 * wrong prices — nothing would crash.
 *
 * So: re-score every displayed card through the JS path and compare against
 * the trend price the model was fitted on. The result is IN-SAMPLE, so it
 * should land somewhat BELOW the out-of-fold median APE that fit_factors.py
 * prints. If it's higher, or wildly different, the two paths have diverged.
 *
 * Run after any change to the factor list or to cardMapping's bucketing.
 * Usage: node scripts/verify-parity.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { computeCardPricing } from './lib/factors.mjs'

const rows = JSON.parse(readFileSync(new URL('training-data.json', import.meta.url), 'utf8'))
const sets = new Set(JSON.parse(readFileSync(new URL('../src/data/generated/sets.json', import.meta.url), 'utf8')).map((s) => s.id))
const ratios = []
for (const r of rows) {
  if (!sets.has(r.setId)) continue
  const cachePath = new URL(`.cache/cards/${encodeURIComponent(r.id)}.json`, import.meta.url)
  if (!existsSync(cachePath)) continue
  const card = JSON.parse(readFileSync(cachePath, 'utf8'))
  const { baseValue } = computeCardPricing(card, r.releaseDate)
  ratios.push(Math.abs(baseValue - r.trend) / r.trend)
}
ratios.sort((a, b) => a - b)
console.log(`n=${ratios.length}`)
console.log(`JS in-sample median APE vs trend: ${(ratios[Math.floor(ratios.length / 2)] * 100).toFixed(1)}%`)
console.log('(compare against the combined out-of-fold median APE printed by fit_factors.py;')
console.log(' in-sample should be somewhat LOWER, not higher — if not, JS and Python have diverged)')
