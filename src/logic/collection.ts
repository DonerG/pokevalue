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
  writeWatch(watchCache.includes(id) ? watchCache.filter((x) => x !== id) : [...watchCache, id])
}

// ---------------------------------------------------------------- portfolio

export type Portfolio = Record<string, number>

let portfolioCache: Portfolio = readPortfolio()
function readPortfolio(): Portfolio {
  try {
    const v = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function loadPortfolio(): Portfolio {
  return portfolioCache
}
function writePortfolio(p: Portfolio): void {
  portfolioCache = p
  try {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(p))
  } catch {
    // localStorage unavailable
  }
  notify()
}
export function portfolioQty(id: string): number {
  return portfolioCache[id] ?? 0
}
export function setPortfolioQty(id: string, qty: number): void {
  const next = { ...portfolioCache }
  if (qty <= 0) delete next[id]
  else next[id] = qty
  writePortfolio(next)
}
export function addToPortfolio(id: string, delta = 1): void {
  setPortfolioQty(id, (portfolioCache[id] ?? 0) + delta)
}

// ---------------------------------------------------------------- hooks

export function useWatchlist(): string[] {
  return useSyncExternalStore(subscribe, loadWatchlist, () => watchCache)
}
export function usePortfolio(): Portfolio {
  return useSyncExternalStore(subscribe, loadPortfolio, () => portfolioCache)
}
