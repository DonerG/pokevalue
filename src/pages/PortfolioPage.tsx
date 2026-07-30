import { useEffect, useMemo, useState } from 'react'
import type { Config } from '../data/defaults'
import { cardImage, loadCardsByIds, type CardData } from '../data/cards'
import { formatEuro, formatPercent, verdict } from '../logic/pricing'
import { setPortfolioQty, usePortfolio } from '../logic/collection'
import { RetryImage } from '../components/RetryImage'
import { useDocumentMeta } from '../logic/documentMeta'

export function PortfolioPage({ config }: { config: Config }) {
  useDocumentMeta('Portfolio', 'Your card portfolio value on PokéValue.', '/portfolio', null)
  const portfolio = usePortfolio()
  const [cards, setCards] = useState<CardData[] | null>(null)

  const ids = useMemo(() => Object.keys(portfolio), [portfolio])

  useEffect(() => {
    let live = true
    loadCardsByIds(ids).then((c) => live && setCards(c))
    return () => {
      live = false
    }
  }, [ids])

  // Sorted by how much each line is worth (trend), biggest first.
  const rows = useMemo(() => {
    if (!cards) return []
    return cards
      .map((card) => {
        const qty = portfolio[card.id] ?? 0
        const market = card.market?.trend ?? null
        return {
          card,
          qty,
          market,
          lineMarket: market != null ? market * qty : null,
          lineFair: card.baseValue * qty,
        }
      })
      .sort((a, b) => (b.lineMarket ?? 0) - (a.lineMarket ?? 0))
  }, [cards, portfolio])

  const totals = useMemo(() => {
    let market = 0
    let fair = 0
    let count = 0
    let anyMarket = false
    for (const r of rows) {
      count += r.qty
      fair += r.lineFair
      if (r.lineMarket != null) {
        market += r.lineMarket
        anyMarket = true
      }
    }
    return { market: anyMarket ? market : null, fair, count }
  }, [rows])

  const totalVerdict = totals.market != null ? verdict(totals.market, totals.fair, config) : null

  return (
    <div className="collection-page portfolio-page">
      <h1>Portfolio</h1>

      {ids.length === 0 ? (
        <p className="muted">
          No cards yet. Open any card and tap <strong>+ Add to portfolio</strong> (set a quantity),
          and the totals show up here.
        </p>
      ) : (
        <>
          <section className="portfolio-summary">
            <div className="portfolio-total">
              <span className="muted">Market value</span>
              <strong>{totals.market != null ? formatEuro(totals.market) : '–'}</strong>
            </div>
            <div className="portfolio-total">
              <span className="muted">Fair value</span>
              <strong>{formatEuro(totals.fair)}</strong>
            </div>
            <div className="portfolio-total">
              <span className="muted">{totals.count} card{totals.count === 1 ? '' : 's'}</span>
              {totalVerdict && (
                <span className={`portfolio-verdict verdict-${totalVerdict.kind}`}>
                  {totalVerdict.kind === 'fair'
                    ? 'Fairly valued overall'
                    : totalVerdict.kind === 'undervalued'
                      ? `Undervalued by ${formatPercent(Math.abs(totalVerdict.deviation)).replace('+', '')}`
                      : `Overvalued by ${formatPercent(Math.abs(totalVerdict.deviation)).replace('+', '')}`}
                </span>
              )}
            </div>
          </section>

          {!cards ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="portfolio-list">
              {rows.map(({ card, qty, market, lineMarket, lineFair }) => {
                const img = cardImage(card, 'low')
                return (
                  <li key={card.id} className="portfolio-row">
                    {img ? (
                      <RetryImage src={img} alt={card.name} loading="lazy" placeholder={<div className="portfolio-thumb-ph" />} />
                    ) : (
                      <div className="portfolio-thumb-ph" />
                    )}
                    <div className="portfolio-row-main">
                      <a href={`/card/${card.id}`}>
                        <strong>{card.name}</strong>{' '}
                        <span className="muted">#{card.localId} · {card.rarity ?? 'unknown'}</span>
                      </a>
                      <span className="muted">
                        {market != null ? formatEuro(market) : '–'} market · {formatEuro(card.baseValue)} fair each
                      </span>
                    </div>
                    <div className="qty-stepper" role="group" aria-label="Quantity">
                      <button type="button" onClick={() => setPortfolioQty(card.id, qty - 1)} aria-label="One fewer">−</button>
                      <span className="qty-value">{qty}</span>
                      <button type="button" onClick={() => setPortfolioQty(card.id, qty + 1)} aria-label="One more">+</button>
                    </div>
                    <div className="portfolio-row-value">
                      <strong>{lineMarket != null ? formatEuro(lineMarket) : '–'}</strong>
                      <span className="muted">{formatEuro(lineFair)} fair</span>
                    </div>
                    <button type="button" className="tile-remove portfolio-remove" title="Remove" onClick={() => setPortfolioQty(card.id, 0)}>
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
