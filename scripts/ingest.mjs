/**
 * Lädt Sets + Karten von TCGdex (api.tcgdex.net) und schreibt sie als JSON
 * nach src/data/generated/. Für jede Karte werden die Standardfaktoren
 * (Seltenheit, Ära, Beliebtheit, Angebot) vorbelegt.
 *
 * Aufruf:  node scripts/ingest.mjs me05 me04
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'generated')
const API = 'https://api.tcgdex.net/v2/en'
const CONCURRENCY = 8

// ---------- Beliebtheits-Tiers nach Pokédex-Nummer (kuratierte Heuristik) ----------

const TIER_S = new Set([
  6, // Glurak
  25, // Pikachu
  150, 151, // Mewtu, Mew
  133, 197, // Evoli, Nachtara
  94, // Gengar
  249, // Lugia
  384, // Rayquaza
])

const TIER_A = new Set([
  134, 135, 136, 196, 470, 471, 700, // übrige Evoli-Entwicklungen
  3, 9, // Bisaflor, Turtok
  4, 5, 7, 8, 1, 2, // Kanto-Starter-Linien
  130, 143, 149, // Garados, Relaxo, Dragoran
  144, 145, 146, // Kanto-Vögel
  243, 244, 245, // Johto-Hunde
  248, // Despotar
  282, // Guardevoir
  359, // Absol
  376, // Metagross
  380, 381, // Latias, Latios
  445, 448, // Knakrack, Lucario
  483, 484, 487, // Dialga, Palkia, Giratina
  493, // Arceus
  658, // Quajutsu
  778, // Mimigma
  887, // Katapuldra
])

const TIER_B = new Set([
  // Starter-Endstufen späterer Generationen
  154, 157, 160, 254, 257, 260, 389, 392, 395, 497, 500, 503,
  652, 655, 724, 727, 730, 812, 815, 818, 908, 911, 914,
  // bekannte Legendäre/Mysteriöse
  250, 382, 383, 385, 386, 480, 481, 482, 485, 486, 488, 489, 490, 491, 492,
  494, 643, 644, 646, 649, 716, 717, 718, 719, 720, 721, 785, 786, 787, 788,
  789, 790, 791, 792, 800, 801, 802, 807, 888, 889, 890, 893, 896, 897, 898,
  905, 1007, 1008, 1024, 1025,
])

function popularityTier(dexIds) {
  if (!dexIds || dexIds.length === 0) return 'c' // Trainer/Energie
  if (dexIds.some((d) => TIER_S.has(d))) return 's'
  if (dexIds.some((d) => TIER_A.has(d))) return 'a'
  if (dexIds.some((d) => TIER_B.has(d))) return 'b'
  return 'c'
}

// ---------- Mapping TCGdex-Seltenheit → Formel-Seltenheit ----------

const RARITY_MAP = {
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

function mapRarity(rarity) {
  if (!rarity) return 'common'
  return RARITY_MAP[rarity.toLowerCase()] ?? 'holo'
}

function mapEra(releaseDate) {
  const year = Number((releaseDate ?? '2024').slice(0, 4))
  if (year >= 2024) return 'current'
  if (year >= 2017) return 'modern'
  if (year >= 2011) return 'mid'
  if (year >= 2003) return 'exdp'
  return 'wotc'
}

/** Moderne Auflagen sind riesig; nur Chase-Karten (Alt Art/Secret) sind relativ knapper. */
function mapSupply(era, rarityId) {
  if (era === 'current' || era === 'modern') {
    return rarityId === 'altart' || rarityId === 'secret' ? 'normal' : 'mass'
  }
  return 'normal'
}

// ---------- API-Helfer ----------

async function fetchJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      console.warn(`  ${url} → HTTP ${res.status} (Versuch ${i + 1}/${tries})`)
    } catch (e) {
      console.warn(`  ${url} → ${e.message} (Versuch ${i + 1}/${tries})`)
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  throw new Error(`Aufgabe fehlgeschlagen: ${url}`)
}

async function mapLimited(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ---------- Ingest ----------

async function ingestSet(setId) {
  console.log(`Lade Set ${setId} …`)
  const set = await fetchJson(`${API}/sets/${setId}`)
  const cardBriefs = set.cards ?? []
  console.log(`  ${set.name} (${set.releaseDate}), ${cardBriefs.length} Karten`)

  let done = 0
  const cards = await mapLimited(cardBriefs, CONCURRENCY, async (brief) => {
    const card = await fetchJson(`${API}/cards/${brief.id}`)
    done++
    if (done % 25 === 0) console.log(`  … ${done}/${cardBriefs.length}`)

    const era = mapEra(set.releaseDate)
    const rarityId = mapRarity(card.rarity)
    const dexIds = card.dexId ?? []
    const cm = card.pricing?.cardmarket
    return {
      id: card.id,
      localId: String(card.localId),
      name: card.name,
      category: card.category ?? 'Pokemon',
      rarity: card.rarity ?? null,
      dexIds,
      image: card.image ?? null,
      market: cm
        ? { trend: cm.trend ?? null, avg30: cm.avg30 ?? null, low: cm.low ?? null, updated: cm.updated ?? null }
        : null,
      preset: {
        rarity: rarityId,
        era,
        popularity: popularityTier(dexIds),
        supply: mapSupply(era, rarityId),
      },
    }
  })

  cards.sort((a, b) => Number(a.localId) - Number(b.localId) || a.localId.localeCompare(b.localId))

  await writeFile(join(OUT_DIR, `cards-${setId}.json`), JSON.stringify(cards, null, 1))
  return {
    id: setId,
    name: set.name,
    serie: set.serie?.name ?? null,
    releaseDate: set.releaseDate,
    logo: set.logo ?? null,
    symbol: set.symbol ?? null,
    cardCount: cards.length,
    withMarket: cards.filter((c) => c.market?.trend != null).length,
  }
}

const setIds = process.argv.slice(2)
if (setIds.length === 0) {
  console.error('Aufruf: node scripts/ingest.mjs <setId> [<setId> …]   (z. B. me05 me04)')
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })

// Bestehende sets.json einlesen und neue Sets ergänzen/ersetzen
let existing = []
try {
  existing = JSON.parse(await readFile(join(OUT_DIR, 'sets.json'), 'utf8'))
} catch {
  // noch keine sets.json vorhanden
}

for (const setId of setIds) {
  const meta = await ingestSet(setId)
  existing = existing.filter((s) => s.id !== meta.id)
  existing.push(meta)
  console.log(`  ✔ ${meta.name}: ${meta.cardCount} Karten, davon ${meta.withMarket} mit Marktpreis`)
}

existing.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
await writeFile(join(OUT_DIR, 'sets.json'), JSON.stringify(existing, null, 1))
console.log(`Fertig. ${existing.length} Set(s) in sets.json.`)
