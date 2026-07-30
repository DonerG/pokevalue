import { useEffect, useState } from 'react'

// Take scroll restoration fully into our own hands (see restoreScrollSoon
// below). Left on the default 'auto', the browser's own — unreliable, since
// SetPage's content height changes after an async load — restoration attempt
// races ours: whichever happens to finish last wins, so the bug only showed
// up intermittently (e.g. after a few seconds on the card page, apparently
// giving the browser's own attempt more room to fire late and stomp on ours).
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

// The site used hash routing (#/set/sv01) until the switch to real paths for
// SEO — a fragment is never sent to the server, so every card and set looked
// like the same URL to a crawler. Old bookmarks and shared links still carry
// the hash, so translate them to the real path before React ever renders.
if (window.location.hash.startsWith('#/')) {
  const legacy = window.location.hash.slice(1)
  history.replaceState(null, '', legacy)
}

export type SetSortKey = 'number' | 'deviation' | 'market' | 'fair'

export type Route =
  | { page: 'home' }
  | { page: 'set'; setId: string; query: string; sort: SetSortKey; minPrice: boolean }
  | { page: 'card'; cardId: string }
  | { page: 'how-it-works' }
  | { page: 'admin-hub' }
  | { page: 'admin-artwork' }
  | { page: 'admin-tera' }
  | { page: 'admin-price-audit' }

const SORT_KEYS: SetSortKey[] = ['number', 'deviation', 'market', 'fair']

export function parsePath(pathname: string, search: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  const params = new URLSearchParams(search)

  if (parts[0] === 'set' && parts[1]) {
    const sortParam = params.get('sort')
    return {
      page: 'set',
      setId: decodeURIComponent(parts[1]),
      query: params.get('q') ?? '',
      sort: SORT_KEYS.includes(sortParam as SetSortKey) ? (sortParam as SetSortKey) : 'number',
      minPrice: params.get('min1') === '1',
    }
  }
  if (parts[0] === 'card' && parts[1]) return { page: 'card', cardId: decodeURIComponent(parts[1]) }
  if (parts[0] === 'how-it-works') return { page: 'how-it-works' }
  if (parts[0] === 'admin' && !parts[1]) return { page: 'admin-hub' }
  if (parts[0] === 'admin' && parts[1] === 'artwork') return { page: 'admin-artwork' }
  if (parts[0] === 'admin' && parts[1] === 'tera') return { page: 'admin-tera' }
  if (parts[0] === 'admin' && parts[1] === 'price-audit') return { page: 'admin-price-audit' }
  return { page: 'home' }
}

function currentRoute(): Route {
  return parsePath(window.location.pathname, window.location.search)
}

/** Location key used for scroll memory: path + query, no origin. */
function locationKey(): string {
  return window.location.pathname + window.location.search
}

// ---------------------------------------------------------------- navigation
//
// pushState/replaceState deliberately do NOT fire popstate, so nothing would
// notice a programmatic navigation on its own — every route consumer
// subscribes here instead, and navigate() tells them after updating the URL.

type Listener = () => void
const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

export function navigate(url: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  notify()
}

/**
 * Rewrites the current set page's URL to carry its search/sort state without
 * pushing a new history entry — so typing in the search box doesn't spam
 * browser history, but the last-seen filters are still there when the user
 * opens a card and then goes back. Deliberately skips notify(): the state it
 * encodes already lives in SetPage's own React state, so re-parsing the route
 * would just hand SetPage back what it already has (and remount it).
 */
export function updateSetFilters(setId: string, query: string, sort: SetSortKey, minPrice: boolean): void {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (sort !== 'number') params.set('sort', sort)
  if (minPrice) params.set('min1', '1')
  const qs = params.toString()
  history.replaceState(null, '', `/set/${setId}${qs ? `?${qs}` : ''}`)
}

/**
 * Should a click on this anchor be handled as an in-app navigation? Anything
 * the browser would treat specially (new tab, download, external host) is
 * left alone, so plain <a href="/card/x"> stays a real link — which is the
 * point: crawlers and "open in new tab" see a normal URL, and only ordinary
 * left-clicks get upgraded to a no-reload SPA transition.
 */
function isInternalNavigation(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented) return false
  if (event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (anchor.target && anchor.target !== '_self') return false
  if (anchor.hasAttribute('download')) return false
  if (anchor.origin !== window.location.origin) return false
  return true
}

// ---------------------------------------------------------------- scroll memory
//
// The browser's native scroll restoration can't be trusted here: a page like
// SetPage renders "Loading…" first and only reaches full height once its
// cards arrive asynchronously, so restoring scroll immediately on popstate
// (before that height exists) has nowhere to scroll to. We remember scroll
// position per location ourselves and let pages that load content async
// (currently just SetPage) re-apply it once they're actually tall enough.

const scrollPositions = new Map<string, number>()

export function saveScrollPosition(key: string, y: number): void {
  scrollPositions.set(key, y)
}

export function getScrollPosition(key: string): number | undefined {
  return scrollPositions.get(key)
}

/** The key SetPage should pass to restoreScrollSoon — same shape as what the scroll listener stores. */
export function currentLocationKey(): string {
  return locationKey()
}

/** Waits two animation frames (one full layout/paint cycle) before scrolling, so it applies after the browser has committed the new content's height. */
export function restoreScrollSoon(key: string): void {
  const y = getScrollPosition(key)
  if (y == null) return
  requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute)

  useEffect(() => {
    // Back/forward restores where the user was; a fresh link click starts at
    // the top. popstate only fires for the former, so the flag it sets is
    // what tells the shared handler which of the two just happened.
    let isPop = false

    const onRouteChange = () => {
      setRoute(currentRoute())
      if (isPop) {
        restoreScrollSoon(locationKey()) // covers pages whose content is already there on first paint
      } else {
        window.scrollTo(0, 0)
      }
      isPop = false
    }

    const onPop = () => {
      isPop = true
      onRouteChange()
    }

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!anchor || !isInternalNavigation(event, anchor as HTMLAnchorElement)) return
      const target = anchor as HTMLAnchorElement
      event.preventDefault()
      const url = target.pathname + target.search
      if (url === locationKey()) return
      navigate(url)
    }

    let scrollFrame = 0
    const onScroll = () => {
      if (scrollFrame) return
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0
        saveScrollPosition(locationKey(), window.scrollY)
      })
    }

    listeners.add(onRouteChange)
    window.addEventListener('popstate', onPop)
    document.addEventListener('click', onClick)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      listeners.delete(onRouteChange)
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('click', onClick)
      window.removeEventListener('scroll', onScroll)
      if (scrollFrame) cancelAnimationFrame(scrollFrame)
    }
  }, [])

  return route
}
