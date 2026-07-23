/**
 * Shared card→feature mapping used by ingest.mjs (fair-value factors),
 * build-artwork-candidates.mjs, and the training/analysis pipeline. Keeping
 * this in one place means everything agrees on what "rarity" and "card type"
 * mean for a given card.
 */

// ---------- Mapping TCGdex rarity → coarse bucket (used only for artwork-rating candidate filtering) ----------

export const RARITY_MAP = {
  common: 'common',
  none: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  'holo rare': 'holo',
  'rare holo': 'holo',
  'radiant rare': 'ultra',
  'amazing rare': 'ultra',
  'double rare': 'ultra',
  'ultra rare': 'fullart',
  'illustration rare': 'fullart',
  'full art trainer': 'fullart',
  'special illustration rare': 'altart',
  'shiny ultra rare': 'altart',
  'secret rare': 'secret',
  'hyper rare': 'secret',
  'mega hyper rare': 'secret',
  'shiny rare': 'secret',
  'gold rare': 'secret',
}

export function mapRarity(rarity) {
  if (!rarity) return 'common'
  return RARITY_MAP[rarity.toLowerCase()] ?? 'holo'
}

/** Rarity buckets where artwork/illustration quality meaningfully drives price. */
export const ARTWORK_RELEVANT_RARITIES = new Set(['ultra', 'fullart', 'altart', 'secret'])

/**
 * Raw TCGdex rarity strings excluded from artwork rating even though their
 * bucket is otherwise chase-tier: Double Rare and Ultra Rare use a
 * standardized card-frame illustration, not a unique composition, so only
 * the depicted Pokémon (already a feature) drives their price — rating
 * "artwork quality" here would just be noise.
 */
export const ARTWORK_EXCLUDED_RAW_RARITIES = new Set(['double rare', 'ultra rare'])

export function isArtworkRateable(rarity) {
  if (!rarity) return false
  if (ARTWORK_EXCLUDED_RAW_RARITIES.has(rarity.toLowerCase())) return false
  return ARTWORK_RELEVANT_RARITIES.has(mapRarity(rarity))
}

// ---------- Card "type" (V / VMAX / GX / EX / ex / Mega EX / …) ----------
// TCGdex exposes this as two separate fields: `suffix` (EX, V, GX, ex, TAG
// TEAM-GX, Prime, LEGEND, SP) and `stage`, which — confusingly — doubles as
// the special-mechanic slot (VMAX, VSTAR, BREAK, MEGA, V-UNION, LEVEL-UP,
// RESTORED) alongside its normal use for evolution stage (Basic/Stage1/
// Stage2, which we deliberately ignore: that's "which Pokémon", not "which
// card mechanic", and Pokémon is already its own feature).
//
// One gap: the *current* "Mega Evolution" series' "Mega X ex" cards don't
// get stage: 'MEGA' the way the older XY-era "M X EX" cards do — TCGdex just
// tags them as a plain Basic 'EX' card. The only reliable signal is the
// literal "Mega " name prefix, so we check that too.
//
// TCGdex's `suffix` casing for "ex"/"EX" doesn't reliably track the real
// old-EX-era vs. new-ex-era distinction (both casings show up scattered
// across both eras — a source-data quirk, not a signal), so we normalize
// case rather than let it fragment one mechanic into noisy near-duplicates.
// The real old/new distinction is already carried by the Set factor.

const SPECIAL_STAGES = new Set(['VMAX', 'VSTAR', 'BREAK', 'V-UNION', 'LEVEL-UP', 'RESTORED'])

export function mapCardType(card) {
  const suffix = card.suffix ? card.suffix.toUpperCase() : null
  const stage = card.stage ?? null
  const isMega = stage === 'MEGA' || /^Mega\s/.test(card.name ?? '')
  if (isMega) return suffix ? `Mega ${suffix}` : 'Mega'
  if (stage && SPECIAL_STAGES.has(stage)) return stage
  if (suffix) return suffix
  return null
}

// ---------- Promo card style (Art Rare vs. plain framed) ----------
// TCGdex has no field for this even though it swings a Promo card's price a
// lot (verified on two real cards: same "Promo" rarity, no structural
// difference anywhere in the data, very different prices) — hand-tagged via
// #/admin/promo-style. Where a tag exists, this refines the rarity used for
// modeling (e.g. "Promo" -> "Promo (Art Rare)") so the existing rarity factor
// picks up the distinction with no other changes to the regression.

export const PROMO_STYLE_LABELS = { art: 'Promo (Art Rare)', normal: 'Promo (Normal)' }

export function effectiveRarity(card, promoStyles) {
  const style = promoStyles?.[card.id]
  if (card.rarity === 'Promo' && style && PROMO_STYLE_LABELS[style]) {
    return PROMO_STYLE_LABELS[style]
  }
  return card.rarity ?? null
}
