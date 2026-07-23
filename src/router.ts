import { useEffect, useState } from 'react'

export type SetSortKey = 'number' | 'deviation' | 'market' | 'fair'

export type Route =
  | { page: 'home' }
  | { page: 'set'; setId: string; query: string; sort: SetSortKey }
  | { page: 'card'; cardId: string }
  | { page: 'admin-artwork' }

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

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    // Back/forward navigation fires `popstate` (right before `hashchange`);
    // a fresh link click or programmatic hash change only fires
    // `hashchange`. Only the latter should jump the scroll position back to
    // the top — restoring history should let the browser put scroll back
    // where the user left it.
    let isPop = false
    const onPop = () => {
      isPop = true
    }
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      if (!isPop) window.scrollTo(0, 0)
      isPop = false
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onChange)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onChange)
    }
  }, [])
  return route
}
