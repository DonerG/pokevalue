/**
 * Extracts the cards with the most extreme deviation between market and fair
 * price, site-wide, into a lean JSON the hidden price-audit admin page
 * loads. The point isn't "these are all mispriced" — most extreme
 * deviations are genuine (a chase card really can be 10x its rarity-tier
 * average) — it's that a bad Cardmarket price (see the Delphox report,
 * README) also shows up as an extreme deviation, so this is the highest-
 * leverage place to spot-check by hand instead of scanning all ~19,000
 * cards.
 *
 * `deviation` uses the SAME formula as the live site's verdict chips
 * (src/logic/pricing.ts::verdict, the "upside" value) — (fair - market) /
 * market, i.e. the % the market price would need to move to reach fair,
 * expressed relative to the market price. Positive = undervalued (market
 * can rise this much); negative = overvalued (market can fall this much).
 * An earlier version of this script computed (market - fair) / fair instead
 * — the wrong denominator AND the wrong sign relative to the rest of the
 * site, caught by a user cross-checking a card here against its own listed
 * verdict elsewhere.
 *
 * Split into two separate top-N lists (overvalued / undervalued) rather
 * than one list ranked by |deviation| — under the formula above, overvalued
 * is capped at -100% (market can't fall below zero relative to itself)
 * while undervalued is unbounded above (market can approach zero, sending
 * fair/market to infinity), so a single combined ranking is almost
 * entirely undervalued cases and buries the rarer, equally-worth-checking
 * overvalued ones under thousands of them.
 *
 * Deliberately NO minimum price floor: what corrupts a factor during
 * training is the *relative* (log-space) error, not the absolute euro
 * amount — a 2-cent card wrongly priced at 90 cents (45x) is exactly as
 * damaging as a chase card off by 45x, and initially excluding sub-EUR1
 * cards here hid real cases like that. Checked empirically that this
 * doesn't just flood the list with cent-level rounding noise instead: a
 * 1-cent rounding difference caps out around a 2x (100%) ratio, well below
 * where genuine errors start appearing (~180%+ by rank 200), so noise
 * doesn't have enough leverage to crowd out real signal at the top.
 *
 * Usage: node scripts/build-outlier-candidates.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const OUT_FILE = join(GENERATED_DIR, 'outlier-candidates.json')
const TOP_N = 100

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))

const candidates = []
for (const set of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8'))
  for (const card of cards) {
    const market = card.market?.trend ?? null
    if (market == null || market <= 0 || card.baseValue <= 0) continue
    const deviation = (card.baseValue - market) / market
    candidates.push({
      id: card.id,
      name: card.name,
      localId: card.localId,
      image: card.image,
      rarity: card.rarity,
      setId: set.id,
      setName: set.name,
      releaseDate: set.releaseDate,
      market,
      fair: card.baseValue,
      deviation,
    })
  }
}

// Overvalued: market > fair -> deviation < 0 -> rank most-negative (closest to -100%) first.
const overvalued = candidates
  .filter((c) => c.deviation < 0)
  .sort((a, b) => a.deviation - b.deviation)
  .slice(0, TOP_N)
// Undervalued: market < fair -> deviation > 0 -> rank most-positive (largest upside) first.
const undervalued = candidates
  .filter((c) => c.deviation > 0)
  .sort((a, b) => b.deviation - a.deviation)
  .slice(0, TOP_N)

await writeFile(OUT_FILE, JSON.stringify({ overvalued, undervalued }))
console.log(
  `Wrote ${overvalued.length} overvalued + ${undervalued.length} undervalued candidates (of ${candidates.length} priced cards) to ${OUT_FILE}`,
)
