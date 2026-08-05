/**
 * The visitor's own watchlist and portfolio, kept in this browser (localStorage)
 * — no account, no backend, same spirit as the rest of the site. A watchlist is
 * a list of card ids; a portfolio maps a card id to a quantity. Both expose a
 * React hook so the header counts, the card-page buttons and the list pages all
 * stay in sync from one source.
 *
 * useSyncExternalStore needs a STABLE snapshot reference between changes, so the
 * parsed values are cached and only replaced when a write actually happens —
 * returning a fresh array/object on every render would loop.
 */
import { useSyncExternalStore } from 'react'

const WATCH_KEY = 'pokevalue-watchlist-v1'
const PORTFOLIO_KEY = 'pokevalue-portfolio-v1'

const listeners = new Set<() => void>()
function notify(): void {
  for (const l of listeners) l()
}
function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ---------------------------------------------------------------- watchlist

let watchCache: string[] = readWatch()
function readWatch(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(WATCH_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function loadWatchlist(): string[] {
  return watchCache
}
function writeWatch(ids: string[]): void {
  watchCache = ids
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(ids))
  } catch {
    // localStorage unavailable — lasts for this session only
  }
  notify()
}
export function isWatched(id: string): boolean {
  return watchCache.includes(id)
}
export function toggleWatch(id: string): void {
  const adding = !watchCache.includes(id)
  writeWatch(adding ? [...watchCache, id] : watchCache.filter((x) => x !== id))
  if (adding) bumpUnseen('watch')
}

// ---------------------------------------------------------------- portfolio
//
// A portfolio is a list of LOTS — one entry per card copy bought, each with the
// price it was bought at (buy) and when it was added (ts). A card held in
// several copies is several lots, so different buy prices for the same card are
// kept apart and each copy can be sold on its own terms. Quantity of a card is
// just how many lots carry its id.
//
// Selling a lot moves it out of holdings and into the sales log (below) as a
// realised gain/loss, so the portfolio value reflects only what's still held.

export interface Lot {
  cardId: string
  /** Price paid for this one copy. null for legacy holdings migrated from the
   *  old quantity-only model, where no buy price was ever recorded. */
  buy: number | null
  /** Added-at epoch ms — also the lot's identity for removal/sale (FIFO). */
  ts: number
}

// v1 was Record<cardId, qty> with no buy prices; v2 is the lot list.
const PORTFOLIO_V2_KEY = 'pokevalue-portfolio-v2'

let portfolioCache: Lot[] = readPortfolio()
function readPortfolio(): Lot[] {
  try {
    const raw = localStorage.getItem(PORTFOLIO_V2_KEY)
    if (raw != null) {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    }
    // One-time migration from the quantity-only v1 store: each unit becomes a
    // lot with an unknown (null) buy price. v1 is left in place, harmless.
    const legacy = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) ?? '{}')
    const lots: Lot[] = []
    if (legacy && typeof legacy === 'object') {
      let ts = Date.now()
      for (const [cardId, qty] of Object.entries(legacy)) {
        for (let i = 0; i < Number(qty); i++) lots.push({ cardId, buy: null, ts: ts++ })
      }
    }
    if (lots.length) writeRaw(PORTFOLIO_V2_KEY, lots)
    return lots
  } catch {
    return []
  }
}

export function loadPortfolio(): Lot[] {
  return portfolioCache
}
function writePortfolio(lots: Lot[]): void {
  portfolioCache = lots
  writeRaw(PORTFOLIO_V2_KEY, lots)
  notify()
}
function writeRaw(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable — lasts for this session only
  }
}

export function lotsFor(id: string): Lot[] {
  return portfolioCache.filter((l) => l.cardId === id)
}
export function portfolioQty(id: string): number {
  return lotsFor(id).length
}

/** Adds one copy of a card at the given buy price (null = price not recorded). */
export function addLot(cardId: string, buy: number | null): void {
  const isNew = portfolioQty(cardId) === 0
  writePortfolio([...portfolioCache, { cardId, buy, ts: Date.now() }])
  if (isNew) bumpUnseen('portfolio')
}

/** Removes the newest lot of a card without recording a sale (an "undo add"). */
export function removeLot(cardId: string): void {
  const lots = lotsFor(cardId)
  if (!lots.length) return
  const newest = lots.reduce((a, b) => (b.ts > a.ts ? b : a))
  writePortfolio(portfolioCache.filter((l) => l !== newest))
}

/** Removes every lot of a card (the row's ✕), no sale recorded. */
export function removeCard(cardId: string): void {
  writePortfolio(portfolioCache.filter((l) => l.cardId !== cardId))
}

/**
 * Sells one copy of a card at `sell`, oldest lot first (FIFO): the lot leaves
 * holdings and a realised gain/loss lands in the sales log with its buy price.
 */
export function sellLot(cardId: string, sell: number): void {
  const lots = lotsFor(cardId)
  if (!lots.length) return
  const oldest = lots.reduce((a, b) => (b.ts < a.ts ? b : a))
  writePortfolio(portfolioCache.filter((l) => l !== oldest))
  writeSales([...salesCache, { cardId, buy: oldest.buy, sell, ts: Date.now() }])
}

// ---------------------------------------------------------------- sales log

export interface Sale {
  cardId: string
  buy: number | null
  sell: number
  /** Sold-at epoch ms. */
  ts: number
}

const SALES_KEY = 'pokevalue-portfolio-sales-v1'

let salesCache: Sale[] = readSales()
function readSales(): Sale[] {
  try {
    const v = JSON.parse(localStorage.getItem(SALES_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
export function loadSales(): Sale[] {
  return salesCache
}
function writeSales(sales: Sale[]): void {
  salesCache = sales
  writeRaw(SALES_KEY, sales)
  notify()
}
/** Removes a ledger entry (does not restore the holding). */
export function deleteSale(ts: number): void {
  writeSales(salesCache.filter((s) => s.ts !== ts))
}

// ---------------------------------------------------------------- unseen badges
//
// The nav badge is a "new since you last looked" counter, not the total: it
// counts cards ADDED since the list was last opened, and resets to nothing when
// you open the list. So adding one card shows a "1", visiting the page clears
// it, and removing a card never raises it.

const UNSEEN_KEYS = { watch: 'pokevalue-watch-unseen-v1', portfolio: 'pokevalue-portfolio-unseen-v1' } as const
type Which = keyof typeof UNSEEN_KEYS

function readInt(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0
  } catch {
    return 0
  }
}
const unseen: Record<Which, number> = { watch: readInt(UNSEEN_KEYS.watch), portfolio: readInt(UNSEEN_KEYS.portfolio) }

function bumpUnseen(which: Which): void {
  unseen[which] += 1
  try {
    localStorage.setItem(UNSEEN_KEYS[which], String(unseen[which]))
  } catch {
    // localStorage unavailable
  }
  notify()
}
export function markSeen(which: Which): void {
  if (unseen[which] === 0) return
  unseen[which] = 0
  try {
    localStorage.setItem(UNSEEN_KEYS[which], '0')
  } catch {
    // localStorage unavailable
  }
  notify()
}

// ---------------------------------------------------------------- hooks

export function useWatchlist(): string[] {
  return useSyncExternalStore(subscribe, loadWatchlist, () => watchCache)
}
export function usePortfolio(): Lot[] {
  return useSyncExternalStore(subscribe, loadPortfolio, () => portfolioCache)
}
export function useSales(): Sale[] {
  return useSyncExternalStore(subscribe, loadSales, () => salesCache)
}
export function useUnseen(which: Which): number {
  return useSyncExternalStore(
    subscribe,
    () => unseen[which],
    () => 0,
  )
}
