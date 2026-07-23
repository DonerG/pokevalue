import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, loadPromoCandidates, type PromoCandidate } from '../data/cards'
import { loadPromoStyles, savePromoStyles, type PromoStyle, type PromoStyles } from '../logic/promoStyles'
import { formatEuro } from '../logic/pricing'

const PAGE_SIZE = 30

function cardThumb(c: PromoCandidate): string | null {
  return c.image ? `${c.image}/low.webp` : null
}

export function AdminPromoStylePage() {
  const [candidates, setCandidates] = useState<PromoCandidate[] | null>(null)
  const [styles, setStyles] = useState<PromoStyles>(() => loadPromoStyles())
  const [query, setQuery] = useState('')
  const [onlyUntagged, setOnlyUntagged] = useState(false)
  const [page, setPage] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPromoCandidates().then(setCandidates)
  }, [])

  const setStyle = (cardId: string, style: PromoStyle) => {
    setStyles((prev) => {
      const next = { ...prev, [cardId]: style }
      savePromoStyles(next)
      return next
    })
  }

  const clearStyle = (cardId: string) => {
    setStyles((prev) => {
      const next = { ...prev }
      delete next[cardId]
      savePromoStyles(next)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!candidates) return []
    const q = query.trim().toLowerCase()
    return candidates.filter((c) => {
      if (onlyUntagged && styles[c.id] != null) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || (c.setName ?? '').toLowerCase().includes(q)
    })
  }, [candidates, query, onlyUntagged, styles])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  const taggedCount = candidates ? candidates.filter((c) => styles[c.id] != null).length : 0

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(styles, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'promo-styles.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file: File) => {
    file.text().then((text) => {
      try {
        const imported = JSON.parse(text) as PromoStyles
        setStyles((prev) => {
          const merged = { ...prev, ...imported }
          savePromoStyles(merged)
          return merged
        })
      } catch {
        alert('Could not read that file as JSON promo styles.')
      }
    })
  }

  return (
    <div className="admin-artwork">
      <header className="admin-header">
        <h2>Promo Card Style</h2>
        <p className="muted">
          Promo cards all share one "Promo" rarity in the data, but some use an extended, poster-like
          illustration ("Art Rare" style) while most use the plain framed template — and that swings
          the price a lot. There's no field for this in the source data, so it has to be tagged by
          eye. Once enough are tagged, this becomes its own factor for Promo cards, the same way card
          type already is. Saved in this browser only; export to keep it somewhere durable.
        </p>
        <div className="admin-toolbar">
          <span className="admin-progress">
            {taggedCount} / {candidates?.length ?? '…'} tagged
          </span>
          <button type="button" onClick={handleExport}>
            Export styles (JSON)
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import styles
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
              checked={onlyUntagged}
              onChange={(e) => {
                setOnlyUntagged(e.target.checked)
                setPage(0)
              }}
            />
            Only untagged
          </label>
        </div>
      </header>

      {!candidates && <p className="muted">Loading candidates…</p>}

      {candidates && (
        <>
          <div className="rating-grid">
            {pageItems.map((c) => {
              const thumb = cardThumb(c)
              const style = styles[c.id]
              return (
                <div key={c.id} className="rating-card">
                  {thumb ? <img src={thumb} alt={c.name} loading="lazy" /> : <div className="rating-card-placeholder" />}
                  <div className="rating-card-body">
                    <strong>{c.name}</strong>
                    <span className="muted">
                      {c.setName} · #{c.localId}
                    </span>
                    <span className="muted">
                      {formatEuro(c.price)} · {formatDate(c.releaseDate)}
                    </span>
                    <div className="rating-scale">
                      <button
                        type="button"
                        className={style === 'art' ? 'rating-btn active' : 'rating-btn'}
                        onClick={() => setStyle(c.id, 'art')}
                      >
                        Art Rare
                      </button>
                      <button
                        type="button"
                        className={style === 'normal' ? 'rating-btn active' : 'rating-btn'}
                        onClick={() => setStyle(c.id, 'normal')}
                      >
                        Normal
                      </button>
                      {style != null && (
                        <button type="button" className="rating-clear" onClick={() => clearStyle(c.id)}>
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
