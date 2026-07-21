/**
 * Trains the pricing model: a small neural network with learned embeddings
 * for Pokémon species, rarity, and card category, plus continuous features
 * for card age and (once rated) artwork quality. Target is log(Cardmarket
 * 30-day average price).
 *
 * Usage: node scripts/train-model.mjs
 * Reads:  scripts/training-data.json, src/data/artwork-ratings.json
 * Writes: scripts/model.json (weights + vocabularies), prints an eval report.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DIMS, forward, initModel, mulberry32 } from './lib/model.mjs'
import { mapEra, mapRarity } from './lib/cardMapping.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRAINING_DATA = join(HERE, 'training-data.json')
const RATINGS_FILE = join(HERE, '..', 'src', 'data', 'artwork-ratings.json')
const MODEL_OUT = join(HERE, 'model.json')

const REFERENCE_DATE = new Date()

// ---------- Load data ----------

const cards = JSON.parse(await readFile(TRAINING_DATA, 'utf8'))
let ratings = {}
try {
  ratings = JSON.parse(await readFile(RATINGS_FILE, 'utf8'))
} catch {
  console.log('No artwork ratings file yet — training without artwork scores.')
}
console.log(`${cards.length} priced cards, ${Object.keys(ratings).length} artwork ratings.`)

// ---------- Vocabularies ----------

const dexSet = new Set()
const raritySet = new Set()
for (const c of cards) {
  if (c.dexIds?.[0] != null) dexSet.add(c.dexIds[0])
  raritySet.add(c.rarity ?? 'None')
}
const dexList = [...dexSet].sort((a, b) => a - b)
const dexIndex = new Map(dexList.map((d, i) => [d, i + 1])) // 0 = none/unknown
const rarityList = [...raritySet].sort()
const rarityIndex = new Map(rarityList.map((r, i) => [r, i + 1])) // 0 = unknown
const categoryList = ['Pokemon', 'Trainer', 'Energy']
const categoryIndex = new Map(categoryList.map((c, i) => [c, i + 1])) // 0 = unknown

console.log(`Vocab: ${dexList.length} Pokémon, ${rarityList.length} rarities, ${categoryList.length} categories.`)

// ---------- Feature rows ----------

function yearsSince(releaseDate) {
  if (!releaseDate) return 1
  const d = new Date(releaseDate)
  if (Number.isNaN(d.getTime())) return 1
  return (REFERENCE_DATE - d) / (365.25 * 24 * 3600 * 1000)
}

function buildRow(card) {
  const rating = ratings[card.id]
  const isRated = rating != null ? 1 : 0
  return {
    id: card.id,
    dexIdx: card.dexIds?.[0] != null ? (dexIndex.get(card.dexIds[0]) ?? 0) : 0,
    rarityIdx: rarityIndex.get(card.rarity ?? 'None') ?? 0,
    categoryIdx: categoryIndex.get(card.category) ?? 0,
    yearsNorm: Math.min(4, yearsSince(card.releaseDate) / 10),
    artworkNorm: isRated ? (rating - 5.5) / 4.5 : 0,
    isRated,
    // kept for reporting only, not fed to the model directly
    _rarityBucket: mapRarity(card.rarity),
    _eraBucket: mapEra(card.releaseDate),
  }
}

const rows = cards.map(buildRow)
const targets = cards.map((c) => Math.log(c.avg30))

// ---------- Train/val split ----------

const rng = mulberry32(1234)
const order = rows.map((_, i) => i)
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1))
  ;[order[i], order[j]] = [order[j], order[i]]
}
const splitAt = Math.floor(order.length * 0.85)
const trainIdx = order.slice(0, splitAt)
const valIdx = order.slice(splitAt)
console.log(`${trainIdx.length} train, ${valIdx.length} validation examples.`)

// ---------- Model + training loop ----------

const model = initModel(
  { vocabPokemon: dexList.length + 1, vocabRarity: rarityList.length + 1, vocabCategory: categoryList.length + 1 },
  42,
)

function zerosLike2D(rows_, cols) {
  return Array.from({ length: rows_ }, () => new Array(cols).fill(0))
}

const velocity = {
  pokemonEmb: model.pokemonEmb.map((v) => v.map(() => 0)),
  rarityEmb: model.rarityEmb.map((v) => v.map(() => 0)),
  categoryEmb: model.categoryEmb.map((v) => v.map(() => 0)),
  W1: zerosLike2D(model.W1.length, model.W1[0].length),
  b1: model.b1.map(() => 0),
  W2: model.W2.map(() => 0),
  b2: 0,
}

function accumulate(map, idx, vec) {
  const cur = map.get(idx)
  if (cur) {
    for (let d = 0; d < vec.length; d++) cur[d] += vec[d]
  } else {
    map.set(idx, [...vec])
  }
}

function trainBatch(batchIdx, lr, momentum, l2Dense, l2Emb) {
  const hidden = model.W1.length
  const inputSize = model.W1[0].length
  const gW1 = zerosLike2D(hidden, inputSize)
  const gb1 = new Array(hidden).fill(0)
  const gW2 = new Array(hidden).fill(0)
  let gb2 = 0
  const gPokemon = new Map()
  const gRarity = new Map()
  const gCategory = new Map()
  let lossSum = 0
  const n = batchIdx.length

  for (const idx of batchIdx) {
    const row = rows[idx]
    const y = targets[idx]
    const { x, hPre, h, yhat } = forward(model, row)
    const diff = yhat - y
    lossSum += diff * diff
    const dyhat = (2 * diff) / n

    for (let j = 0; j < hidden; j++) gW2[j] += dyhat * h[j]
    gb2 += dyhat

    const dhPre = new Array(hidden)
    for (let j = 0; j < hidden; j++) {
      const dh = dyhat * model.W2[j]
      dhPre[j] = hPre[j] > 0 ? dh : 0
    }

    const dx = new Array(x.length).fill(0)
    for (let j = 0; j < hidden; j++) {
      const g = dhPre[j]
      if (g === 0) continue
      gb1[j] += g
      const wRow = model.W1[j]
      const gRow = gW1[j]
      for (let i = 0; i < x.length; i++) {
        gRow[i] += g * x[i]
        dx[i] += g * wRow[i]
      }
    }

    let off = 0
    accumulate(gPokemon, row.dexIdx, dx.slice(off, off + DIMS.pokemon))
    off += DIMS.pokemon
    accumulate(gRarity, row.rarityIdx, dx.slice(off, off + DIMS.rarity))
    off += DIMS.rarity
    accumulate(gCategory, row.categoryIdx, dx.slice(off, off + DIMS.category))
  }

  // ---- apply updates (SGD + momentum + weight decay) ----
  for (let j = 0; j < hidden; j++) {
    for (let i = 0; i < inputSize; i++) {
      const g = gW1[j][i] + l2Dense * model.W1[j][i]
      velocity.W1[j][i] = momentum * velocity.W1[j][i] - lr * g
      model.W1[j][i] += velocity.W1[j][i]
    }
    velocity.b1[j] = momentum * velocity.b1[j] - lr * gb1[j]
    model.b1[j] += velocity.b1[j]

    const g2 = gW2[j] + l2Dense * model.W2[j]
    velocity.W2[j] = momentum * velocity.W2[j] - lr * g2
    model.W2[j] += velocity.W2[j]
  }
  velocity.b2 = momentum * velocity.b2 - lr * gb2
  model.b2 += velocity.b2

  const applyEmb = (table, velTable, gradMap, l2) => {
    for (const [idx, grad] of gradMap) {
      const row = table[idx]
      const vRow = velTable[idx]
      for (let d = 0; d < row.length; d++) {
        const g = grad[d] + l2 * row[d]
        vRow[d] = momentum * vRow[d] - lr * g
        row[d] += vRow[d]
      }
    }
  }
  applyEmb(model.pokemonEmb, velocity.pokemonEmb, gPokemon, l2Emb)
  applyEmb(model.rarityEmb, velocity.rarityEmb, gRarity, l2Emb)
  applyEmb(model.categoryEmb, velocity.categoryEmb, gCategory, l2Emb)

  return lossSum / n
}

function evaluate(idxList) {
  let sumSqErr = 0
  let sumAbsPct = 0
  const absPcts = []
  let sumY = 0
  for (const idx of idxList) sumY += targets[idx]
  const meanY = sumY / idxList.length
  let ssTot = 0
  for (const idx of idxList) {
    const row = rows[idx]
    const y = targets[idx]
    const { yhat } = forward(model, row)
    const diff = yhat - y
    sumSqErr += diff * diff
    ssTot += (y - meanY) ** 2
    const actual = Math.exp(y)
    const pred = Math.exp(yhat)
    const pct = Math.abs(pred - actual) / actual
    sumAbsPct += pct
    absPcts.push(pct)
  }
  absPcts.sort((a, b) => a - b)
  const median = absPcts[Math.floor(absPcts.length / 2)]
  const mse = sumSqErr / idxList.length
  const r2 = 1 - sumSqErr / ssTot
  return { mse, r2, meanAbsPct: sumAbsPct / idxList.length, medianAbsPct: median }
}

const EPOCHS = 200
const BATCH_SIZE = 256
let lr = 0.05
const momentum = 0.9
const l2Dense = 5e-5
const l2Emb = 2e-3

function cloneModel(m) {
  return {
    dims: m.dims,
    pokemonEmb: m.pokemonEmb.map((v) => [...v]),
    rarityEmb: m.rarityEmb.map((v) => [...v]),
    categoryEmb: m.categoryEmb.map((v) => [...v]),
    W1: m.W1.map((v) => [...v]),
    b1: [...m.b1],
    W2: [...m.W2],
    b2: m.b2,
  }
}

let bestValMse = Infinity
let bestModel = cloneModel(model)
let bestEpoch = 0

console.log('\nTraining …')
for (let epoch = 1; epoch <= EPOCHS; epoch++) {
  // shuffle train indices
  for (let i = trainIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[trainIdx[i], trainIdx[j]] = [trainIdx[j], trainIdx[i]]
  }
  for (let start = 0; start < trainIdx.length; start += BATCH_SIZE) {
    const batch = trainIdx.slice(start, start + BATCH_SIZE)
    trainBatch(batch, lr, momentum, l2Dense, l2Emb)
  }
  if (epoch % 10 === 0 || epoch === EPOCHS) {
    const trainEval = evaluate(trainIdx)
    const valEval = evaluate(valIdx)
    const marker = valEval.mse < bestValMse ? ' *' : ''
    console.log(
      `epoch ${epoch}/${EPOCHS}  lr=${lr.toFixed(4)}  train MSE=${trainEval.mse.toFixed(4)} R²=${trainEval.r2.toFixed(3)} medAPE=${(trainEval.medianAbsPct * 100).toFixed(1)}%  |  val MSE=${valEval.mse.toFixed(4)} R²=${valEval.r2.toFixed(3)} medAPE=${(valEval.medianAbsPct * 100).toFixed(1)}%${marker}`,
    )
    if (valEval.mse < bestValMse) {
      bestValMse = valEval.mse
      bestModel = cloneModel(model)
      bestEpoch = epoch
    }
  }
  if (epoch % 50 === 0) lr *= 0.5
}

console.log(`\nUsing checkpoint from epoch ${bestEpoch} (lowest validation MSE).`)
Object.assign(model, bestModel)

// ---------- Segment report ----------

console.log('\nValidation error by rarity bucket:')
const byRarity = new Map()
for (const idx of valIdx) {
  const row = rows[idx]
  const { yhat } = forward(model, row)
  const actual = Math.exp(targets[idx])
  const pred = Math.exp(yhat)
  const pct = Math.abs(pred - actual) / actual
  const list = byRarity.get(row._rarityBucket) ?? []
  list.push(pct)
  byRarity.set(row._rarityBucket, list)
}
for (const [bucket, pcts] of [...byRarity.entries()].sort()) {
  pcts.sort((a, b) => a - b)
  const median = pcts[Math.floor(pcts.length / 2)]
  console.log(`  ${bucket.padEnd(10)} n=${String(pcts.length).padEnd(5)} medAPE=${(median * 100).toFixed(1)}%`)
}

console.log('\nValidation error by era bucket:')
const byEra = new Map()
for (const idx of valIdx) {
  const row = rows[idx]
  const { yhat } = forward(model, row)
  const actual = Math.exp(targets[idx])
  const pred = Math.exp(yhat)
  const pct = Math.abs(pred - actual) / actual
  const list = byEra.get(row._eraBucket) ?? []
  list.push(pct)
  byEra.set(row._eraBucket, list)
}
for (const [bucket, pcts] of [...byEra.entries()].sort()) {
  pcts.sort((a, b) => a - b)
  const median = pcts[Math.floor(pcts.length / 2)]
  console.log(`  ${bucket.padEnd(10)} n=${String(pcts.length).padEnd(5)} medAPE=${(median * 100).toFixed(1)}%`)
}

// ---------- Save ----------

await writeFile(
  MODEL_OUT,
  JSON.stringify({
    trainedAt: new Date().toISOString(),
    referenceDate: REFERENCE_DATE.toISOString(),
    dexIndex: Object.fromEntries(dexIndex),
    rarityIndex: Object.fromEntries(rarityIndex),
    categoryIndex: Object.fromEntries(categoryIndex),
    model,
  }),
)
console.log(`\nSaved model to ${MODEL_OUT}`)
