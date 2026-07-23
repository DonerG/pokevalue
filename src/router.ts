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

export type SetSortKey = 'number' | 'deviation' | 'market' | 'fair'

export type Route =
  | { page: 'home' }
  | { page: 'set'; setId: string; query: string; sort: SetSortKey }
  | { page: 'card'; cardId: string }
  | { page: 'admin-artwork' }
  | { page: 'admin-promo-style' }

const SORT_KEYS: SetSortKey[] = ['number', 'deviation', 'market', 'fair']

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [path, qs] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  const params = new URLSearchParams(qs ?? '')

  if (parts[0] === 'set' && parts[1]) {
    const sortParam = params.get('sort')
    return {
      page: 'set',
      setId: parts[1],
      query: params.get('q') ?? '',
      sort: SORT_KEYS.includes(sortParam as SetSortKey) ? (sortParam as SetSortKey) : 'number',
    }
  }
  if (parts[0] === 'card' && parts[1]) return { page: 'card', cardId: parts[1] }
  if (parts[0] === 'admin' && parts[1] === 'artwork') return { page: 'admin-artwork' }
  if (parts[0] === 'admin' && parts[1] === 'promo-style') return { page: 'admin-promo-style' }
  return { page: 'home' }
}

/**
 * Rewrites the current set page's URL to carry its search/sort state, without
 * pushing a new history entry or firing hashchange (replaceState does
 * neither) — so typing in the search box doesn't spam browser history, but
 * the last-seen filters are still there when the user opens a card and then
 * goes back.
 */
export function updateSetFilters(setId: string, query: string, sort: SetSortKey): void {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (sort !== 'number') params.set('sort', sort)
  const qs = params.toString()
  history.replaceState(null, '', `#/set/${setId}${qs ? `?${qs}` : ''}`)
}

// ---------------------------------------------------------------- scroll memory
//
// The browser's native scroll restoration can't be trusted here: a page like
// SetPage renders "Loading…" first and only reaches full height once its
// cards arrive asynchronously, so restoring scroll immediately on popstate
// (before that height exists) has nowhere to scroll to. We remember scroll
// position per hash ourselves and let pages that load content async
// (currently just SetPage) re-apply it once they're actually tall enough.

const scrollPositions = new Map<string, number>()

export function saveScrollPosition(hash: string, y: number): void {
  scrollPositions.set(hash, y)
}

export function getScrollPosition(hash: string): number | undefined {
  return scrollPositions.get(hash)
}

/** Waits two animation frames (one full layout/paint cycle) before scrolling, so it applies after the browser has committed the new content's height. */
export function restoreScrollSoon(hash: string): void {
  const y = getScrollPosition(hash)
  if (y == null) return
  requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    // Back/forward navigation fires `popstate` (right before `hashchange`);
    // a fresh link click or programmatic hash change only fires
    // `hashchange`. Only the latter should jump the scroll position back to
    // the top — a pop should restore where the user was instead.
    let isPop = false
    const onPop = () => {
      isPop = true
    }
    const onChange = () => {
      const hash = window.location.hash
      setRoute(parseHash(hash))
      if (isPop) {
        restoreScrollSoon(hash) // covers pages whose content is already there on first paint
      } else {
        window.scrollTo(0, 0)
      }
      isPop = false
    }

    let scrollFrame = 0
    const onScroll = () => {
      if (scrollFrame) return
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0
        saveScrollPosition(window.location.hash, window.scrollY)
      })
    }

    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onChange)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('scroll', onScroll)
      if (scrollFrame) cancelAnimationFrame(scrollFrame)
    }
  }, [])
  return route
}
