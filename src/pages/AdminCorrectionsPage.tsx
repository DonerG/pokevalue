import { useEffect, useMemo, useState } from 'react'
import { loadCorrectionCandidates, formatDate, type CorrectionCandidate } from '../data/cards'
import { formatEuro } from '../logic/pricing'
import { loadPriceExclusions, savePriceExclusions } from '../logic/priceExclusions'
import { RetryImage } from '../components/RetryImage'

/** How far the current automatic price sits from the manual one, as a fraction of the manual. */
function gap(c: CorrectionCandidate): number | null {
  if (c.manualTrend == null || c.rawTrend == null || c.manualTrend === 0) return null
  return Math.abs(c.rawTrend - c.manualTrend) / c.manualTrend
}

/**
 * Review the cards whose price was hand-corrected because Cardmarket had it
 * wrong. Each row shows the manual price against the CURRENT automatic
 * Cardmarket price (rawMarket, from the last refresh). When the two are back in
 * line, Cardmarket has likely fixed its bug — "Cardmarket works again" drops the
 * correction so the card goes back to the automatic feed. Anything still off you
 * leave in place and keep updating by hand.
 */
export function AdminCorrectionsPage() {
  const [cards, setCards] = useState<CorrectionCandidate[] | null>(null)
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadCorrectionCandidates().then(setCards)
  }, [])

  const resolve = (id: string) => {
    const next = { ...loadPriceExclusions() }
    delete next[id]
    savePriceExclusions(next)
    setResolved((prev) => new Set(prev).add(id))
  }

  const shown = useMemo(() => (cards ?? []).filter((c) => !resolved.has(c.id)), [cards, resolved])

  return (
    <div className="admin-corrections">
      <header className="admin-header">
        <h2>Manual price corrections</h2>
        <p className="muted">
          Cards whose trend price you set by hand because Cardmarket's was wrong. Each shows your
          manual price against the <strong>current</strong> automatic Cardmarket price (from the last
          refresh). When they line up again, Cardmarket has probably fixed its bug — hand the card
          back with <strong>Cardmarket works again</strong>, and the automatic price takes over.
          Anything still off, leave as is and keep it updated by hand.
        </p>
        <div className="admin-toolbar">
          <span className="admin-progress">{shown.length} corrected</span>
        </div>
      </header>

      {!cards && <p className="muted">Loading…</p>}

      {cards && shown.length === 0 && <p className="muted">No hand-corrected cards.</p>}

      {shown.map((c) => {
        const g = gap(c)
        const close = g != null && g <= 0.1
        const img = c.image ? `${c.image}/low.webp` : null
        return (
          <div key={c.id} className={close ? 'correction-row is-close' : 'correction-row'}>
            {img ? (
              <RetryImage src={img} alt={c.name} loading="lazy" placeholder={<div className="correction-thumb-ph" />} />
            ) : (
              <div className="correction-thumb-ph" />
            )}
            <div className="correction-body">
              <a href={`/card/${c.id}`}>
                <strong>{c.name}</strong> <span className="muted">#{c.localId} · {c.setName}</span>
              </a>
              <div className="correction-prices">
                <span>
                  Your manual price: <strong>{c.manualTrend != null ? formatEuro(c.manualTrend) : '–'}</strong>
                </span>
                <span>
                  Cardmarket now:{' '}
                  <strong>{c.rawTrend != null ? formatEuro(c.rawTrend) : 'no price'}</strong>
                  {c.rawUpdated && <span className="muted"> · {formatDate(c.rawUpdated)}</span>}
                </span>
                {g != null && (
                  <span className={close ? 'correction-gap close' : 'correction-gap'}>
                    {close ? '✓ back in line' : `${(g * 100).toFixed(0)}% apart`}
                  </span>
                )}
              </div>
            </div>
            <button type="button" className="correction-resolve" onClick={() => resolve(c.id)}>
              Cardmarket works again →
            </button>
          </div>
        )
      })}
    </div>
  )
}
