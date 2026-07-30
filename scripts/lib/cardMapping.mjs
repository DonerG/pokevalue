/**
 * Shared card→feature mapping used by ingest.mjs (fair-value factors),
 * build-artwork-candidates.mjs, and the training/analysis pipeline. Keeping
 * this in one place means everything agrees on what "rarity" and "card type"
 * mean for a given card.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// ---------- "Trainer's Pokémon" species recovery ----------
// Scarlet & Violet introduced cards owned by a Trainer ("Team Rocket's
// Mewtwo ex", "N's Reshiram", "Erika's Vileplume ex"). TCGdex files these
// as category "Pokemon" but leaves dexId EMPTY — so without this they fall
// into the same "no Pokémon" bucket as Trainers and Energy, losing the
// single strongest price signal a card has (54 distinct names, 66 cards).
// The species is always the tail of the name after the possessive, minus
// any card-type suffix, so recover the dex id from that and let the normal
// Pokémon factor apply. Verified: all 54 names resolve, including the
// hyphenated "Ethan's Ho-Oh ex".

const POKEDEX_NAMES = JSON.parse(
  readFileSync(join(HERE, '..', '..', 'src', 'data', 'generated', 'pokedex-names.json'), 'utf8'),
)

const DEX_ID_BY_SPECIES = new Map()
for (const [id, name] of Object.entries(POKEDEX_NAMES)) {
  if (!DEX_ID_BY_SPECIES.has(name)) DEX_ID_BY_SPECIES.set(name, Number(id))
}

const POSSESSIVE_PREFIX = /^.+?'s\s+/
const CARD_TYPE_SUFFIX = /\s+(ex|EX|V|VMAX|VSTAR|GX|BREAK|LV\.X)$/

function speciesDexIdFromName(name) {
  if (!name) return null
  let species = name.replace(POSSESSIVE_PREFIX, '')
  let previous
  do {
    previous = species
    species = species.replace(CARD_TYPE_SUFFIX, '')
  } while (species !== previous)
  return DEX_ID_BY_SPECIES.get(species.toLowerCase().replace(/\s+/g, '-')) ?? null
}

/**
 * The dex IDs a card should be modeled under: TCGdex's own when present,
 * otherwise recovered from the name for Trainer-owned Pokémon (see above).
 * Everything downstream keys off this, so a card gets its Pokémon factor and
 * is kept out of the Trainer/Energy-only "cardName" factor.
 */
export function effectiveDexIds(card) {
  if (card.dexId?.length) return card.dexId
  if (card.category !== 'Pokemon') return []
  const dexId = speciesDexIdFromName(card.name)
  return dexId == null ? [] : [dexId]
}

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
  // Promos are deliberately NOT rated here: their classification — alt art and
  // its 8/9/10 grade, stamped, plain — is its own scheme (PROMO_STYLE_LABELS),
  // and since the two promo sets came off the site none of them is displayed
  // anyway. The existing tags still refine their rarity in training.
  if (rarity.toLowerCase() === 'promo') return false
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
// This used to assume the old/new price gap was already covered by the Set
// factor — checked that empirically and it isn't (old "EX" cards: median
// EUR64.62, new "ex" cards: median EUR1.88, a card-type premium that
// compressed over time much like rarity's did — see RARITY_ERA_BUCKETS
// below), so cardType is also worth an era interaction at some point.

const SPECIAL_STAGES = new Set(['VMAX', 'VSTAR', 'BREAK', 'V-UNION', 'LEVEL-UP', 'RESTORED'])

// A "Tera" Pokémon ex is a Scarlet & Violet-era treatment (the crystalline
// card frame) that trades at a premium over a plain ex of the same rarity.
// TCGdex does not mark it — checked: the Obsidian Flames Charizard ex, a Tera
// card, carries no Tera field, subtype or rule text — so the distinction is
// hand-tagged on /admin/tera and stored in src/data/tera-tags.json, then split
// off into its own card type here. Only ex cards are ever tagged, so the split
// can't reach V / GX / Mega / vintage EX (which stays "EX", separated from
// modern ex by the card-type × year interaction as before).
export const TERA_EX = 'Tera ex'

export function mapCardType(card, teraTags) {
  const suffix = card.suffix ? card.suffix.toUpperCase() : null
  const stage = card.stage ?? null
  const isMega = stage === 'MEGA' || /^Mega\s/.test(card.name ?? '')
  if (isMega) return suffix ? `Mega ${suffix}` : 'Mega'
  if (stage && SPECIAL_STAGES.has(stage)) return stage
  if (suffix === 'EX' && teraTags?.[card.id]) return TERA_EX
  if (suffix) return suffix
  return null
}

// ---------- Promo card style ----------
// Every promo carries the single rarity "Promo" on TCGdex, but they are not
// one kind of card. Some are alt arts with a full unique illustration, some
// are ordinary-looking reprints, some of those carry an event stamp — and the
// price gap between them is large. Nothing in the data distinguishes them, so
// 110 of them were hand-tagged (src/data/promo-styles.json).
//
// The two promo sets are no longer DISPLAYED on the site. Measured before the
// removal, promos ran ~2x the median error of normal cards in every price band
// (EUR0.30-3: 49% vs 24%; EUR3-30: 38% vs 26%; EUR30+: 60% vs 33%), and only 3%
// of them are cheap enough for that to be a percentage artifact. Tagging helped
// a lot — untagged 62% median error, tagged 31-35% — but not enough: what a
// promo sells for is mostly a function of how hard it was to get hold of
// (prerelease, tournament, Pokemon Center exclusive, magazine insert), and no
// amount of tagging puts that in the data. The tags are kept because they still
// refine the rarity level of the training-only rows below.
//
// A tag refines the rarity used for modeling ("Promo" -> "Promo (Alt Art 9)"),
// which means the existing rarity, rarity x era and rarity x set factors pick
// the distinction up with no other change to the regression.
//
// The alt-art tiers are the reviewer's own 8/9/10 artwork grades, kept apart
// rather than merged into one "alt art" bucket because they measurably are not
// one thing: against the untagged model, grade 10 promos were underpriced ~8x,
// grade 9 ~1.7x and grade 8 ~1.5x, while cards the reviewer marked as having no
// real artwork were already priced correctly (0.96x). Merging them would leave
// the top tier badly underpriced and overcorrect the bottom one.
export const PROMO_STYLE_LABELS = {
  altart10: 'Promo (Alt Art 10)',
  altart9: 'Promo (Alt Art 9)',
  altart8: 'Promo (Alt Art 8)',
  altart0: 'Promo (Alt Art, weak)',
  stamped: 'Promo (Stamped)',
  normal: 'Promo (Normal)',
  // Legacy value from the first version of the tagging page, which only knew
  // "art" vs "normal". Kept so re-importing an older export degrades to an
  // ungraded alt art instead of silently dropping the tag altogether.
  art: 'Promo (Alt Art)',
}

export function effectiveRarity(card, promoStyles) {
  const style = promoStyles?.[card.id]
  if (card.rarity === 'Promo' && style && PROMO_STYLE_LABELS[style]) {
    return PROMO_STYLE_LABELS[style]
  }
  return card.rarity ?? null
}

// ---------- Release year (for the rarity x year / card type x year terms) ----------
// A "Rare" card meant something very different in 1999 than it does today —
// the game has added tier after tier above it (Double Rare, Ultra Rare,
// Illustration Rare, Special Illustration Rare, Hyper Rare, ...), diluting
// what "Rare" signals. Checked empirically: median Rare/Common price ratio is
// 32.55x for cards printed before 2003 vs. 2.25x for cards from 2023 on, and a
// single global rarity factor can't represent that shift. Neither can the Set
// factor — it moves a whole set up or down, it can't change the ratio BETWEEN
// rarities inside it.
//
// This used to bucket into five broad eras (WOTC / EX-DP / BW-XY / SM-SWSH /
// SV+), which turned out too coarse at the recent end: one "SV+" bucket spans
// 2023-2026, and within it Illustration Rare prices drifted 1.4-2.1x while
// Special Illustration Rares went the other way. Plain release year fixes that
// with no extra factor in the formula — measured, it removes more of the bias
// than adding separate rarity x set and card type x set factors did, while
// keeping the model two terms shorter.
//
// Mirrors analysis/fit_factors.py::release_year — keep both in sync.

export function releaseYear(releaseDate) {
  if (!releaseDate) return 'Unknown'
  const year = releaseDate.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : 'Unknown'
}

// ---------- Artwork grade ----------
// Hand-rated illustration quality (src/data/artwork-ratings.json, entered on
// /admin/artwork as 10 / 9 / 8 / worse). Only the chase rarities are rated —
// a Double Rare uses a standard frame, there is nothing to judge.
//
// The 8s are deliberately thrown away. The reviewer flagged them as unreliable
// ("I used 8 both for acceptable artwork and for cards I couldn't judge,
// mostly the gold Hyper Rares"), and the data agrees exactly: measured against
// the model, an 8 outside Hyper Rares sits at 1.00 and an unrated chase card
// at 0.98 — indistinguishable. The other three grades are strongly ordered
// (10 -> 0.63, 9 -> 0.73, worse -> 1.36), so those are what gets modeled.
//
// Promos are excluded: their grade is already baked into their rarity level
// ("Promo (Alt Art 9)"), so counting it again here would double it.
const ARTWORK_GRADE_LABELS = { 10: 'top', 9: 'strong', 0: 'weak' }

export function artworkGrade(cardId, ratings, promoStyles) {
  if (!cardId || promoStyles?.[cardId]) return 'none'
  return ARTWORK_GRADE_LABELS[ratings?.[cardId]] ?? 'none'
}

