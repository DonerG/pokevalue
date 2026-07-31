import { useEffect } from 'react'
import { neighbours } from '../logic/cardNav'
import { navigate } from '../router'

/**
 * Previous / next through the order the user was browsing (the set page's
 * current filter + sort, remembered in logic/cardNav). Arrow-key friendly.
 * Renders nothing when this card wasn't reached from a list — a directly opened
 * card link has no order to step through.
 */
export function CardPrevNext({ cardId }: { cardId: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const n = neighbours(cardId)
      if (e.key === 'ArrowLeft' && n.prev) navigate(`/card/${n.prev}`)
      else if (e.key === 'ArrowRight' && n.next) navigate(`/card/${n.next}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cardId])

  const { prev, next } = neighbours(cardId)
  if (!prev && !next) return null

  return (
    <nav className="card-prevnext" aria-label="Previous or next card">
      {prev ? (
        <a href={`/card/${prev}`} className="prevnext-btn">
          ← Previous
        </a>
      ) : (
        <span className="prevnext-btn is-disabled">← Previous</span>
      )}
      <span className="prevnext-hint muted">Use ← → keys</span>
      {next ? (
        <a href={`/card/${next}`} className="prevnext-btn">
          Next →
        </a>
      ) : (
        <span className="prevnext-btn is-disabled">Next →</span>
      )}
    </nav>
  )
}
