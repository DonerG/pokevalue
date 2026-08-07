import { useEffect, useState } from 'react'
import { loadGuardedCards, type GuardedCard } from '../data/cards'
import { formatEuro } from '../logic/pricing'
import { RetryImage } from '../components/RetryImage'
import { useDocumentMeta } from '../logic/documentMeta'

export function AdminGuardedPage() {
  useDocumentMeta('Guarded prices', 'Cards whose feed price the guard is holding back.', '/admin/guarded', null)
  const [rows, setRows] = useState<GuardedCard[] | null>(null)

  useEffect(() => {
    loadGuardedCards().then(setRows)
  }, [])

  return (
    <div className="admin-hub">
      <header className="admin-header">
        <h2>Guarded prices</h2>
        <p className="muted">
          Cards whose Cardmarket feed made an implausible <strong>&gt;20% single-day jump</strong> on
          a price over €1. The old price is kept everywhere (site, model, history) and the feed value
          is ignored — automatically, until the feed settles back within 20% (auto-released) or you
          review the card. Open a card and mark it <strong>verified</strong> to accept the new price,
          or <strong>Save price</strong> to correct it by hand.
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
