import { useEffect, useMemo, useRef, useState } from 'react'
import { loadOutlierCandidates, type OutlierCandidate } from '../data/cards'
import { loadPriceExclusions, savePriceExclusions, type PriceExclusions } from '../logic/priceExclusions'
import { formatEuro, formatPercent } from '../logic/pricing'
import { RetryImage } from '../components/RetryImage'

const PAGE_SIZE = 30

function cardThumb(c: OutlierCandidate): string | null {
  return c.image ? `${c.image}/low.webp` : null
}

function cardmarketSearchUrl(c: OutlierCandidate): string {
  const setSlug = encodeURIComponent(c.setName.replace(/\s+/g, '-'))
  const query = encodeURIComponent(`${c.name} ${c.localId}`)
  return `https://www.cardmarket.com/en/Pokemon/Products/Singles/${setSlug}?searchString=${query}`
}

export function AdminPriceAuditPage() {
  const [candidates, setCandidates] = useState<OutlierCandidate[] | null>(null)
  const [exclusions, setExclusions] = useState<PriceExclusions>(() => loadPriceExclusions())
  const [query, setQuery] = useState('')
  const [onlyUnflagged, setOnlyUnflagged] = useState(true)
  const [page, setPage] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadOutlierCandidates().then(setCandidates)
  }, [])

  const flag = (cardId: string) => {
    setExclusions((prev) => {
      const next = { ...prev, [cardId]: true as const }
      savePriceExclusions(next)
      return next
    })
  }

  const unflag = (cardId: string) => {
    setExclusions((prev) => {
      const next = { ...prev }
      delete next[cardId]
      savePriceExclusions(next)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!candidates) return []
    const q = query.trim().toLowerCase()
    return candidates.filter((c) => {
      if (onlyUnflagged && exclusions[c.id]) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.setName.toLowerCase().includes(q)
    })
  }, [candidates, query, onlyUnflagged, exclusions])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  const flaggedCount = candidates ? candidates.filter((c) => exclusions[c.id]).length : 0

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(exclusions, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'price-exclusions.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file: File) => {
    file.text().then((text) => {
      try {
        const imported = JSON.parse(text) as PriceExclusions
        setExclusions((prev) => {
          const merged = { ...prev, ...imported }
          savePriceExclusions(merged)
          return merged
        })
      } catch {
        alert('Could not read that file as JSON price exclusions.')
      }
    })
  }

  return (
    <div className="admin-artwork">
      <header className="admin-header">
        <h2>Price Audit</h2>
        <p className="muted">
          The {candidates?.length ?? '…'} cards (priced ≥ €1) with the biggest gap between market and
          fair price, site-wide — most are genuine (a chase card really can be far above its
          rarity-tier average), but this is also exactly where a bad Cardmarket price shows up (see
          the README for a confirmed example). Spot-check with "Cardmarket ↗" and flag anything
          that's clearly wrong — flagged cards are excluded from the next model retrain. Saved in
          this browser only; export to keep it somewhere durable.
        </p>
        <div className="admin-toolbar">
          <span className="admin-progress">
            {flaggedCount} / {candidates?.length ?? '…'} flagged
          </span>
          <button type="button" onClick={handleExport}>
            Export exclusions (JSON)
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import exclusions
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
              checked={onlyUnflagged}
              onChange={(e) => {
                setOnlyUnflagged(e.target.checked)
                setPage(0)
              }}
            />
            Only unflagged
          </label>
        </div>
      </header>

      {!candidates && <p className="muted">Loading candidates…</p>}

      {candidates && (
        <>
          <div className="rating-grid">
            {pageItems.map((c) => {
              const thumb = cardThumb(c)
              const flagged = exclusions[c.id] === true
              return (
                <div key={c.id} className="rating-card">
                  {thumb ? (
                    <RetryImage
                      src={thumb}
                      alt={c.name}
                      loading="lazy"
                      placeholder={<div className="rating-card-placeholder" />}
                    />
                  ) : (
                    <div className="rating-card-placeholder" />
                  )}
                  <div className="rating-card-body">
                    <strong>{c.name}</strong>
                    <span className="muted">
                      {c.setName} · #{c.localId} · {c.rarity ?? 'unknown'}
                    </span>
                    <span className="muted">
                      Market {formatEuro(c.market)} · Fair {formatEuro(c.fair)} · {formatPercent(c.deviation)}
                    </span>
                    <a href={cardmarketSearchUrl(c)} target="_blank" rel="noreferrer" className="cardmarket-link">
                      Cardmarket ↗
                    </a>
                    <div className="rating-scale">
                      <button
                        type="button"
                        className={flagged ? 'rating-btn active' : 'rating-btn'}
                        onClick={() => (flagged ? unflag(c.id) : flag(c.id))}
                      >
                        {flagged ? 'Flagged as wrong' : 'Flag as wrong'}
                      </button>
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
