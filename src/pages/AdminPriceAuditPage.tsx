import { useEffect, useMemo, useRef, useState } from 'react'
import { loadOutlierCandidates, type OutlierCandidate, type OutlierCandidates } from '../data/cards'
import {
  correctedTrend,
  loadPriceExclusions,
  reviewKind,
  savePriceExclusions,
  type PriceExclusions,
  type PriceReview,
} from '../logic/priceExclusions'
import { formatEuro, formatPercent, parseNumber } from '../logic/pricing'
import { RetryImage } from '../components/RetryImage'

const PAGE_SIZE = 30
type Direction = 'overvalued' | 'undervalued'

function cardThumb(c: OutlierCandidate): string | null {
  return c.image ? `${c.image}/low.webp` : null
}

// The set-scoped Singles URL silently ignores searchString entirely — see
// cardmarketUrl() in data/cards.ts for the confirmed-by-hand explanation.
// This mirrors that fix (kept separate: OutlierCandidate isn't a CardData).
function cardmarketSearchUrl(c: OutlierCandidate): string {
  const query = encodeURIComponent(`${c.name} ${c.localId}`)
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${query}`
}

export function AdminPriceAuditPage() {
  const [data, setData] = useState<OutlierCandidates | null>(null)
  const [direction, setDirection] = useState<Direction>('overvalued')
  const [exclusions, setExclusions] = useState<PriceExclusions>(() => loadPriceExclusions())
  const [query, setQuery] = useState('')
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(true)
  const [page, setPage] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadOutlierCandidates().then(setData)
  }, [])

  const candidates = data ? data[direction] : null

  const setReview = (cardId: string, review: PriceReview) => {
    setExclusions((prev) => {
      const next = { ...prev, [cardId]: review }
      savePriceExclusions(next)
      return next
    })
  }

  const clearReview = (cardId: string) => {
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
      if (onlyUnreviewed && exclusions[c.id]) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.setName.toLowerCase().includes(q)
    })
  }, [candidates, query, onlyUnreviewed, exclusions])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  const countKind = (k: 'wrong' | 'verified' | 'corrected') =>
    candidates ? candidates.filter((c) => reviewKind(exclusions[c.id]) === k).length : 0
  const wrongCount = countKind('wrong')
  const verifiedCount = countKind('verified')
  const correctedCount = countKind('corrected')

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
          The 100 cards with the biggest market-vs-fair gap in each direction, site-wide — most are
          genuine (a chase card really can be far above its rarity-tier average), but this is also
          exactly where a bad Cardmarket price shows up (see the README for a confirmed example).
          Percentage matches the site's own verdict chips (upside relative to market price, e.g.
          +200% = market can rise 3x to reach fair, -80% = market can fall 80%). Split into two tabs
          rather than one ranked list: "undervalued" is mathematically unbounded (market can approach
          zero), while "overvalued" is capped at -100% — combined into one list, undervalued cases
          buried almost every overvalued one. Spot-check with "Cardmarket ↗", then either:
        </p>
        <ul className="muted">
          <li>
            <strong>Type the real trend price</strong> into the box — best option when you can read
            the correct number off Cardmarket. It replaces the broken one on the site and in the
            next retrain. Only the trend price is needed; a corrected card then shows that price
            alone, with no 30-day average beside it.
          </li>
          <li>
            <strong>Wrong</strong> — the price is broken and there's nothing better to put there.
            Dropped from training, price hidden on the site.
          </li>
          <li>
            <strong>Verified</strong> — the price is real, the model just can't explain it (e.g.
            hype). Nothing changes; it's only recorded so your next review pass can skip it.
          </li>
        </ul>
        <p className="muted">
          Saved in this browser only; export to keep it somewhere durable.
        </p>
        <div className="admin-toolbar">
          <label className="admin-checkbox">
            <input
              type="radio"
              name="direction"
              checked={direction === 'overvalued'}
              onChange={() => {
                setDirection('overvalued')
                setPage(0)
              }}
            />
            Overvalued (market above fair)
          </label>
          <label className="admin-checkbox">
            <input
              type="radio"
              name="direction"
              checked={direction === 'undervalued'}
              onChange={() => {
                setDirection('undervalued')
                setPage(0)
              }}
            />
            Undervalued (market below fair)
          </label>
        </div>
        <div className="admin-toolbar">
          <span className="admin-progress">
            {wrongCount} wrong · {correctedCount} corrected · {verifiedCount} verified /{' '}
            {candidates?.length ?? '…'}
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
              checked={onlyUnreviewed}
              onChange={(e) => {
                setOnlyUnreviewed(e.target.checked)
                setPage(0)
              }}
            />
            Only unreviewed
          </label>
        </div>
      </header>

      {!candidates && <p className="muted">Loading candidates…</p>}

      {candidates && (
        <>
          <div className="rating-grid">
            {pageItems.map((c) => {
              const thumb = cardThumb(c)
              const review = exclusions[c.id]
              const kind = reviewKind(review)
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
                        className={kind === 'wrong' ? 'rating-btn active' : 'rating-btn'}
                        onClick={() => setReview(c.id, 'wrong')}
                        title="Price is broken and we have nothing better — dropped from training, hidden on the site"
                      >
                        Wrong
                      </button>
                      <button
                        type="button"
                        className={kind === 'verified' ? 'rating-btn active' : 'rating-btn'}
                        onClick={() => setReview(c.id, 'verified')}
                        title="Price is real (e.g. hype) — kept in training, just marked as reviewed"
                      >
                        Verified
                      </button>
                      {review != null && (
                        <button type="button" className="rating-clear" onClick={() => clearReview(c.id)}>
                          clear
                        </button>
                      )}
                    </div>
                    {/* Read the real trend price off Cardmarket and type it in: it
                        replaces the broken one everywhere, instead of the card just
                        being dropped. Trend only — that's what the site shows and
                        the model is fitted on. */}
                    <label className="price-fix">
                      <span>Correct trend price</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 0.07"
                        defaultValue={correctedTrend(review) ?? ''}
                        key={`${c.id}-${correctedTrend(review) ?? ''}`}
                        onBlur={(e) => {
                          const raw = e.target.value.trim()
                          if (!raw) {
                            if (kind === 'corrected') clearReview(c.id)
                            return
                          }
                          const value = parseNumber(raw)
                          if (Number.isFinite(value) && value > 0) setReview(c.id, { corrected: value })
                          else e.target.value = String(correctedTrend(review) ?? '')
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                      />
                    </label>
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
