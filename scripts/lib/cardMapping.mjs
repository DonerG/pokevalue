/**
 * Shared card→feature mapping used by ingest.mjs (site presets), the artwork
 * candidate extraction, and the pricing model training pipeline. Keeping this
 * in one place means the model and the display defaults agree on what
 * "rarity", "era", and "popularity" mean for a given card.
 */

// ---------- Popularity tiers by Pokédex number (curated heuristic) ----------
// Superseded by the trained model's learned per-Pokémon effect once the model
// ships, but still used for the pre-model presets in ingest.mjs.

export const TIER_S = new Set([
  6, // Charizard
  25, // Pikachu
  150, 151, // Mewtwo, Mew
  133, 197, // Eevee, Umbreon
  94, // Gengar
  249, // Lugia
  384, // Rayquaza
])

export const TIER_A = new Set([
  134, 135, 136, 196, 470, 471, 700, // remaining Eevee evolutions
  3, 9, // Venusaur, Blastoise
  4, 5, 7, 8, 1, 2, // Kanto starter lines
  130, 143, 149, // Gyarados, Snorlax, Dragonite
  144, 145, 146, // Kanto birds
  243, 244, 245, // Johto legendary beasts
  248, // Tyranitar
  282, // Gardevoir
  359, // Absol
  376, // Metagross
  380, 381, // Latias, Latios
  445, 448, // Garchomp, Lucario
  483, 484, 487, // Dialga, Palkia, Giratina
  493, // Arceus
  658, // Greninja
  778, // Mimikyu
  887, // Dragapult
])

export const TIER_B = new Set([
  // starter final stages of later generations
  154, 157, 160, 254, 257, 260, 389, 392, 395, 497, 500, 503,
  652, 655, 724, 727, 730, 812, 815, 818, 908, 911, 914,
  // well-known Legendaries/Mythicals
  250, 382, 383, 385, 386, 480, 481, 482, 485, 486, 488, 489, 490, 491, 492,
  494, 643, 644, 646, 649, 716, 717, 718, 719, 720, 721, 785, 786, 787, 788,
  789, 790, 791, 792, 800, 801, 802, 807, 888, 889, 890, 893, 896, 897, 898,
  905, 1007, 1008, 1024, 1025,
])

export function popularityTier(dexIds) {
  if (!dexIds || dexIds.length === 0) return 'c' // Trainer/Energy
  if (dexIds.some((d) => TIER_S.has(d))) return 's'
  if (dexIds.some((d) => TIER_A.has(d))) return 'a'
  if (dexIds.some((d) => TIER_B.has(d))) return 'b'
  return 'c'
}

// ---------- Mapping TCGdex rarity → formula rarity ----------

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

export function mapEra(releaseDate) {
  const year = Number((releaseDate ?? '2024').slice(0, 4))
  if (year >= 2024) return 'current'
  if (year >= 2017) return 'modern'
  if (year >= 2011) return 'mid'
  if (year >= 2003) return 'exdp'
  return 'wotc'
}

/** Modern print runs are huge; only chase cards (alt art/secret) are relatively scarcer. */
export function mapSupply(era, rarityId) {
  if (era === 'current' || era === 'modern') {
    return rarityId === 'altart' || rarityId === 'secret' ? 'normal' : 'mass'
  }
  return 'normal'
}
