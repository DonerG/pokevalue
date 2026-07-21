/**
 * A small feed-forward neural network with learned embeddings for the
 * categorical card features (Pokémon species, rarity, category). Shared
 * between the training script and anything that needs to load/run a saved
 * model (e.g. a future prediction step in the app's build).
 *
 * Architecture: concat(pokemonEmb, rarityEmb, categoryEmb, continuous) →
 * dense(hidden, ReLU) → dense(1, linear) = predicted log(price).
 */

export const DIMS = { pokemon: 4, rarity: 4, category: 2, continuous: 3, hidden: 16 }

export function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randVec(n, scale, rng) {
  return Array.from({ length: n }, () => (rng() * 2 - 1) * scale)
}

function zeros(n) {
  return new Array(n).fill(0)
}

export function initModel({ vocabPokemon, vocabRarity, vocabCategory }, seed = 42) {
  const rng = mulberry32(seed)
  const inputSize = DIMS.pokemon + DIMS.rarity + DIMS.category + DIMS.continuous
  return {
    dims: DIMS,
    pokemonEmb: Array.from({ length: vocabPokemon }, () => randVec(DIMS.pokemon, 0.05, rng)),
    rarityEmb: Array.from({ length: vocabRarity }, () => randVec(DIMS.rarity, 0.1, rng)),
    categoryEmb: Array.from({ length: vocabCategory }, () => randVec(DIMS.category, 0.1, rng)),
    W1: Array.from({ length: DIMS.hidden }, () => randVec(inputSize, Math.sqrt(2 / inputSize), rng)),
    b1: zeros(DIMS.hidden),
    W2: randVec(DIMS.hidden, Math.sqrt(2 / DIMS.hidden), rng),
    b2: 0,
  }
}

/** Builds the raw (unconcatenated) feature vectors for one example — reused by forward() and by the explain-panel breakdown. */
export function lookupFeatures(model, row) {
  return {
    pe: model.pokemonEmb[row.dexIdx],
    re: model.rarityEmb[row.rarityIdx],
    ce: model.categoryEmb[row.categoryIdx],
    cont: [row.yearsNorm, row.artworkNorm, row.isRated],
  }
}

/** Forward pass. Returns everything backward() needs, plus the prediction. */
export function forward(model, row) {
  const { pe, re, ce, cont } = lookupFeatures(model, row)
  const x = [...pe, ...re, ...ce, ...cont]
  const hPre = new Array(model.W1.length)
  const h = new Array(model.W1.length)
  for (let j = 0; j < model.W1.length; j++) {
    let sum = model.b1[j]
    const wRow = model.W1[j]
    for (let i = 0; i < x.length; i++) sum += wRow[i] * x[i]
    hPre[j] = sum
    h[j] = sum > 0 ? sum : 0
  }
  let yhat = model.b2
  for (let j = 0; j < h.length; j++) yhat += model.W2[j] * h[j]
  return { x, hPre, h, yhat }
}

export function predictLogPrice(model, row) {
  return forward(model, row).yhat
}
