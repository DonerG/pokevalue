import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSearchIndex, SETS, type SearchIndexCard } from '../data/cards'
import { navigate } from '../router'
import { RetryImage } from './RetryImage'

const MAX_CARDS = 8
const MAX_SETS = 4

/**
 * The always-available search in the header nav: the same card/set search as the
 * home page, but reachable from every page. Results drop down under the field;
 * each is a real link so a click (or the router's own handler) navigates and the
 * field clears. The search index (~200 KB) is fetched the first time the field
 * is focused, so pages that never search don't pay for it.
 */
export function HeaderSearch() {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<SearchIndexCard[] | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const ensureIndex = () => {
    if (!index) loadSearchIndex().then(setIndex)
  }

  const q = query.trim().toLowerCase()
  const sets = useMemo(
    () => (q ? SETS.filter((s) => s.name.toLowerCase().includes(q)).slice(0, MAX_SETS) : []),
    [q],
  )
  const cards = useMemo(
    () =>
      q && index
        ? index
            .filter((c) => c.name.toLowerCase().includes(q) || c.localId.toLowerCase().includes(q))
            .slice(0, MAX_CARDS)
        : [],
    [q, index],
  )

  // Close when clicking anywhere outside the search.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const clear = () => {
    setQuery('')
    setOpen(false)
  }

  // Enter (or the footer link) opens the home page as a full results list for
  // the term — the dropdown is only a peek at the top matches.
  const showAll = () => {
    const term = query.trim()
    if (!term) return
    navigate(`/?q=${encodeURIComponent(term)}`)
    clear()
  }

  const showDropdown = open && q.length > 0
  const hasResults = sets.length > 0 || cards.length > 0

  return (
    <div className="header-search" ref={ref}>
      <input
        type="search"
        value={query}
        placeholder="Search cards…"
        aria-label="Search cards or sets"
        onFocus={() => {
          ensureIndex()
          setOpen(true)
        }}
        onChange={(e) => {
          ensureIndex()
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Enter') {
            showAll()
          }
        }}
      />
      {showDropdown && (
        <div className="header-search-results">
          {!hasResults ? (
            <p className="header-search-empty muted">{index ? 'No match.' : 'Loading…'}</p>
          ) : (
            <>
              {sets.map((s) => (
                <a key={s.id} href={`/set/${s.id}`} className="header-search-item" onClick={clear}>
                  <span className="hs-tag">Set</span>
                  <span className="hs-name">{s.name}</span>
                </a>
              ))}
              {cards.map((c) => {
                const thumb = c.image ? `${c.image}/low.webp` : null
                return (
                  <a key={c.id} href={`/card/${c.id}`} className="header-search-item" onClick={clear}>
                    {thumb ? (
                      <RetryImage src={thumb} alt="" loading="lazy" placeholder={<span className="hs-thumb-ph" />} />
                    ) : (
                      <span className="hs-thumb-ph" />
                    )}
                    <span className="hs-name">{c.name}</span>
                    <span className="hs-meta muted">
                      {c.setName} · #{c.localId}
                    </span>
                  </a>
                )
              })}
              <button type="button" className="header-search-all" onClick={showAll}>
                See all results for “{query.trim()}” ↵
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
