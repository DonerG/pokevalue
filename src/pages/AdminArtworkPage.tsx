import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, loadArtworkCandidates, type ArtworkCandidate } from '../data/cards'
import { loadRatings, saveRatings, type Ratings } from '../logic/artworkRatings'
import { formatEuro } from '../logic/pricing'

const PAGE_SIZE = 30
const SCALE = Array.from({ length: 10 }, (_, i) => i + 1)

function cardThumb(c: ArtworkCandidate): string | null {
  return c.image ? `${c.image}/low.webp` : null
}

export function AdminArtworkPage() {
  const [candidates, setCandidates] = useState<ArtworkCandidate[] | null>(null)
  const [ratings, setRatings] = useState<Ratings>(() => loadRatings())
  const [query, setQuery] = useState('')
  const [onlyUnrated, setOnlyUnrated] = useState(false)
  const [page, setPage] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadArtworkCandidates().then(setCandidates)
  }, [])

  const setRating = (cardId: string, score: number) => {
    setRatings((prev) => {
      const next = { ...prev, [cardId]: score }
      saveRatings(next)
      return next
    })
  }

  const clearRating = (cardId: string) => {
    setRatings((prev) => {
      const next = { ...prev }
      delete next[cardId]
      saveRatings(next)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!candidates) return []
    const q = query.trim().toLowerCase()
    return candidates.filter((c) => {
      if (onlyUnrated && ratings[c.id] != null) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || (c.setName ?? '').toLowerCase().includes(q)
    })
  }, [candidates, query, onlyUnrated, ratings])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  const ratedCount = candidates ? candidates.filter((c) => ratings[c.id] != null).length : 0

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(ratings, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'artwork-ratings.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file: File) => {
    file.text().then((text) => {
      try {
        const imported = JSON.parse(text) as Ratings
        setRatings((prev) => {
          const merged = { ...prev, ...imported }
          saveRatings(merged)
          return merged
        })
      } catch {
        alert('Could not read that file as JSON ratings.')
      }
    })
  }

  return (
    <div className="admin-artwork">
      <header className="admin-header">
        <h2>Artwork Rating</h2>
        <p className="muted">
          Rate the illustration quality of chase cards on a 1–10 scale. Not currently used by the
          live pricing model (descoped for this version — see the README) but kept here for future
          data collection. Ratings are saved in this browser only; export the file to keep them
          somewhere durable.
        </p>
        <div className="admin-toolbar">
          <span className="admin-progress">
            {ratedCount} / {candidates?.length ?? '…'} rated
          </span>
          <button type="button" onClick={handleExport}>
            Export ratings (JSON)
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import ratings
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
              e.target.value = ''
            }}
          />
        </div>
        <div className="admin-toolbar">
          <input
            type="search"
            placeholder="Search name or set…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={onlyUnrated}
              onChange={(e) => {
                setOnlyUnrated(e.target.checked)
                setPage(0)
              }}
            />
            Only unrated
          </label>
        </div>
      </header>

      {!candidates && <p className="muted">Loading candidates…</p>}

      {candidates && (
        <>
          <div className="rating-grid">
            {pageItems.map((c) => {
              const thumb = cardThumb(c)
              const score = ratings[c.id]
              return (
                <div key={c.id} className="rating-card">
                  {thumb ? <img src={thumb} alt={c.name} loading="lazy" /> : <div className="rating-card-placeholder" />}
                  <div className="rating-card-body">
                    <strong>{c.name}</strong>
                    <span className="muted">
                      {c.setName} · #{c.localId} · {c.rarity}
                    </span>
                    <span className="muted">
                      {formatEuro(c.price)} · {formatDate(c.releaseDate)}
                    </span>
                    <div className="rating-scale">
                      {SCALE.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={score === n ? 'rating-btn active' : 'rating-btn'}
                          onClick={() => setRating(c.id, n)}
                        >
                          {n}
                        </button>
                      ))}
                      {score != null && (
                        <button type="button" className="rating-clear" onClick={() => clearRating(c.id)}>
                          clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filtered.length === 0 && <p className="muted">No cards match.</p>}

          <div className="admin-pagination">
            <button type="button" disabled={pageSafe === 0} onClick={() => setPage(pageSafe - 1)}>
              ← Prev
            </button>
            <span>
              Page {pageSafe + 1} / {pageCount} ({filtered.length} cards)
            </span>
            <button type="button" disabled={pageSafe >= pageCount - 1} onClick={() => setPage(pageSafe + 1)}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
