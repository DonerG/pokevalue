import { useEffect, useState } from 'react'

export type Route =
  | { page: 'home' }
  | { page: 'set'; setId: string }
  | { page: 'card'; cardId: string }
  | { page: 'calculator' }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'set' && parts[1]) return { page: 'set', setId: parts[1] }
  if (parts[0] === 'card' && parts[1]) return { page: 'card', cardId: parts[1] }
  if (parts[0] === 'calculator') return { page: 'calculator' }
  return { page: 'home' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
