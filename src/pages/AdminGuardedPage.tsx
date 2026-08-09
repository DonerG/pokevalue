import { useEffect, useState } from 'react'
import { loadGuardedCards, type GuardedCard } from '../data/cards'
import { formatEuro } from '../logic/pricing'
import { loadPriceExclusions, savePriceExclusions, reviewKind } from '../logic/priceExclusions'
import { RetryImage } from '../components/RetryImage'
import { useDocumentMeta } from '../logic/documentMeta'

export function AdminGuardedPage() {
  useDocumentMeta('Guarded prices', 'Cards whose feed price the guard is holding back.', '/admin/guarded', null)
  const [rows, setRows] = useState<GuardedCard[] | null>(null)
  // Bumped after each edit so the row states re-read from localStorage.
  const [, force] = useState(0)
  const bump = () => force((n) => n + 1)

  useEffect(() => {
    loadGuardedCards().then(setRows)
  }, [])

  // Accept the feed price → mark the card "verified", which the guard skips, so
  // from the next rebuild the current market price is used and the hold is
  // released. Stored in this browser (like every admin edit); Export all on the
  // hub, then it's applied on the next data update.
  const accept = (id: string) => {
    savePriceExclusions({ ...loadPriceExclusions(), [id]: 'verified' })
    bump()
  }
  const undo = (id: string) => {
    const next = { ...loadPriceExclusions() }
    delete next[id]
    savePriceExclusions(next)
    bump()
  }

  const exclusions = loadPriceExclusions()

  return (
    <div className="admin-hub">
      <header className="admin-header">
        <h2>Guarded prices</h2>
        <p className="muted">
          Cards whose Cardmarket feed made an implausible <strong>&gt;20% single-day jump</strong> on
          a price over €1. The old price is kept everywhere (site, model, history) and the feed value
          is ignored — until the feed settles back within 20% (auto-released) or you review it here.
        </p>
        <p className="muted">
          If the jump is real, hit <strong>Accept</strong> to take the new price (the card is marked
          verified and the guard lets it through from the next update). If it’s a bad feed value,
          leave it — the old price simply stays. To pin a specific price by hand instead, open the
          card and use <strong>Save price</strong>. Your choices are saved in this browser; use{' '}
          <strong>Export all</strong> on the <a href="/admin">admin hub</a> to apply them.
        </p>
      </header>

      {!rows ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nothing on hold — no price spikes caught.</p>
      ) : (
        <ul className="portfolio-list">
          {rows.map((r) => {
            const img = r.image ? `${r.image}/low.webp` : null
            const kind = reviewKind(exclusions[r.id])
            return (
              <li key={r.id} className="portfolio-row">
                {img ? (
                  <RetryImage src={img} alt={r.name} loading="lazy" placeholder={<div className="portfolio-thumb-ph" />} />
                ) : (
                  <div className="portfolio-thumb-ph" />
                )}
                <div className="portfolio-row-main">
                  <a href={`/card/${r.id}`}>
                    <strong>{r.name}</strong> <span className="muted">#{r.localId} · {r.setName}</span>
                  </a>
                  <span className="muted">held since {r.since}</span>
                </div>
                <div className="portfolio-row-value">
                  <strong>{formatEuro(r.kept)} kept</strong>
                  <span className="muted">feed said {formatEuro(r.rejected)}</span>
                </div>
                <div className="guarded-actions">
                  {kind == null ? (
                    <button type="button" className="portfolio-mini" onClick={() => accept(r.id)}>
                      Accept {formatEuro(r.rejected)}
                    </button>
                  ) : (
                    <>
                      <span className="guarded-done">
                        {kind === 'verified' ? '✓ accepted' : kind === 'corrected' ? 'corrected' : 'marked wrong'} · export to apply
                      </span>
                      <button type="button" className="portfolio-mini" onClick={() => undo(r.id)}>
                        Undo
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
