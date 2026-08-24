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
          Cards whose Cardmarket price the guard distrusts — either an implausible{' '}
          <strong>single-day jump</strong>, or a trend price that has drifted far outside its own{' '}
          <strong>30-day average</strong>. A held card keeps its old price everywhere (site, model,
          history) until the feed comes back in line, and a jump-hold is released automatically after
          three days, because a move the feed sticks to isn’t a spike any more.
        </p>
        <p className="muted">
          <strong>Unresolved</strong> rows are different: there the old price looks just as broken as
          the new one, so nothing is being held back — the current feed price is live on the site and
          only you can say what it should be. Open the card and use <strong>Save price</strong> to
          pin a hand-read value.
        </p>
        <p className="muted">
          If a held jump is real, hit <strong>Accept</strong> to take the new price (the card is
          marked verified and the guard lets it through from the next update). If it’s a bad feed
          value, leave it — the old price simply stays. Your choices are saved in this browser; use{' '}
          <strong>Export all</strong> on the <a href="/admin">admin hub</a> to apply them.
        </p>
      </header>

      {!rows ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nothing flagged — every price looks plausible.</p>
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
                  <span className="muted">
                    {r.reason === 'unresolved'
                      ? `unresolved since ${r.since} — no sane fallback price`
                      : r.reason === 'implausible-feed'
                        ? `held since ${r.since} — feed is off its own 30-day average`
                        : `held since ${r.since} — single-day jump`}
                  </span>
                </div>
                <div className="portfolio-row-value">
                  {r.held ? (
                    <>
                      <strong>{formatEuro(r.kept)} kept</strong>
                      <span className="muted">feed said {formatEuro(r.rejected)}</span>
                    </>
                  ) : (
                    <>
                      <strong>{formatEuro(r.kept)} live</strong>
                      <span className="muted">nothing held back</span>
                    </>
                  )}
                  {r.avg30 != null && <span className="muted">30-day avg {formatEuro(r.avg30)}</span>}
                </div>
                <div className="guarded-actions">
                  {kind == null ? (
                    r.held ? (
                      <button type="button" className="portfolio-mini" onClick={() => accept(r.id)}>
                        Accept {formatEuro(r.rejected)}
                      </button>
                    ) : (
                      <a className="portfolio-mini" href={`/card/${r.id}`}>
                        Review
                      </a>
                    )
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
