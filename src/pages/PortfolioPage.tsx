import { useEffect, useMemo, useState } from 'react'
import type { Config } from '../data/defaults'
import { cardImage, formatDate, loadCardsByIds, type CardData } from '../data/cards'
import { formatEuro, formatEuro1, formatPercent, verdict } from '../logic/pricing'
import {
  addLot,
  deleteSale,
  removeCard,
  sellLot,
  usePortfolio,
  useSales,
  type Lot,
  type Sale,
} from '../logic/collection'
import { RetryImage } from '../components/RetryImage'
import { PortfolioHistoryChart } from '../components/PortfolioHistoryChart'
import { useDocumentMeta } from '../logic/documentMeta'

/** Signed euro amount with an explicit + / − and colour class. */
function signedEuro(v: number): { text: string; cls: string } {
  const cls = v > 0 ? 'pl-pos' : v < 0 ? 'pl-neg' : 'pl-flat'
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  return { text: `${sign}${formatEuro(Math.abs(v))}`, cls }
}

interface CardRow {
  card: CardData
  qty: number
  market: number | null
  fairEach: number
  lineMarket: number | null
  lineFair: number
  /** Sum of the known buy prices held for this card. */
  cost: number
  /** How many held copies carry a known buy price (the rest were migrated). */
  knownQty: number
}

export function PortfolioPage({ config }: { config: Config }) {
  useDocumentMeta('Portfolio', 'Your card portfolio value on PokéValue.', '/portfolio', null)
  const lots = usePortfolio()
  const sales = useSales()
  const [cards, setCards] = useState<Map<string, CardData> | null>(null)

  // Cards needed for both held lots and past sales (the ledger shows names).
  const ids = useMemo(
    () => [...new Set([...lots.map((l) => l.cardId), ...sales.map((s) => s.cardId)])],
    [lots, sales],
  )
  const idsKey = ids.join(',')

  useEffect(() => {
    let live = true
    loadCardsByIds(ids).then((c) => live && setCards(new Map(c.map((x) => [x.id, x]))))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  // Inline add/sell field: which card, which action, and the typed amount.
  const [action, setAction] = useState<{ cardId: string; kind: 'add' | 'sell' } | null>(null)
  const [amount, setAmount] = useState('')
  const openAction = (cardId: string, kind: 'add' | 'sell') => {
    setAction({ cardId, kind })
    setAmount('')
  }
  const submitAction = () => {
    if (!action) return
    const n = Number(amount.replace(',', '.'))
    const valid = amount.trim() !== '' && Number.isFinite(n) && n >= 0
    if (action.kind === 'sell') {
      if (!valid) return
      sellLot(action.cardId, n)
    } else {
      addLot(action.cardId, valid ? n : null)
    }
    setAction(null)
    setAmount('')
  }

  const lotsByCard = useMemo(() => {
    const m = new Map<string, Lot[]>()
    for (const l of lots) {
      const arr = m.get(l.cardId)
      if (arr) arr.push(l)
      else m.set(l.cardId, [l])
    }
    return m
  }, [lots])

  const rows: CardRow[] = useMemo(() => {
    if (!cards) return []
    const out: CardRow[] = []
    for (const [cardId, cardLots] of lotsByCard) {
      const card = cards.get(cardId)
      if (!card) continue
      const qty = cardLots.length
      const known = cardLots.filter((l) => l.buy != null)
      const cost = known.reduce((s, l) => s + (l.buy ?? 0), 0)
      const market = card.market?.trend ?? null
      out.push({
        card,
        qty,
        market,
        fairEach: card.baseValue,
        lineMarket: market != null ? market * qty : null,
        lineFair: card.baseValue * qty,
        cost,
        knownQty: known.length,
      })
    }
    return out.sort((a, b) => (b.lineMarket ?? 0) - (a.lineMarket ?? 0))
  }, [cards, lotsByCard])

  const totals = useMemo(() => {
    let market = 0
    let fair = 0
    let cost = 0
    let count = 0
    let anyMarket = false
    // Cost basis of the copies still held that also have a market price, so the
    // unrealised gain compares like with like.
    let costOfPriced = 0
    let marketOfPriced = 0
    for (const r of rows) {
      count += r.qty
      fair += r.lineFair
      cost += r.cost
      if (r.lineMarket != null) {
        market += r.lineMarket
        anyMarket = true
        if (r.knownQty > 0 && r.market != null) {
          costOfPriced += r.cost
          marketOfPriced += r.market * r.knownQty
        }
      }
    }
    return {
      market: anyMarket ? market : null,
      fair,
      cost,
      count,
      unreal: costOfPriced > 0 ? { euro: marketOfPriced - costOfPriced, base: costOfPriced } : null,
    }
  }, [rows])

  const realized = useMemo(() => {
    let sum = 0
    let known = 0
    for (const s of sales) {
      if (s.buy != null) {
        sum += s.sell - s.buy
        known++
      }
    }
    return { sum, known, count: sales.length }
  }, [sales])

  const totalVerdict = totals.market != null ? verdict(totals.market, totals.fair, config) : null
  // Absolute euro distance of the whole portfolio's market value from its fair value.
  const marketFairGap = totals.market != null ? formatEuro1(Math.abs(totals.fair - totals.market)) : ''
  const qtyByCard = useMemo(() => Object.fromEntries(rows.map((r) => [r.card.id, r.qty])), [rows])
  const sortedSales = useMemo(() => [...sales].sort((a, b) => b.ts - a.ts), [sales])

  return (
    <div className="collection-page portfolio-page">
      <h1>Portfolio</h1>

      {lots.length === 0 && sales.length === 0 ? (
        <p className="muted">
          No cards yet. On any card tap <strong>+ Add to portfolio</strong> and enter what you paid,
          and the totals, gains and value history show up here.
        </p>
      ) : (
        <>
          {lots.length > 0 && (
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
                <span className="muted">Total paid</span>
                <strong>{totals.cost > 0 ? formatEuro(totals.cost) : '–'}</strong>
              </div>
              <div className="portfolio-total">
                <span className="muted">{totals.count} card{totals.count === 1 ? '' : 's'}</span>
                <div className="portfolio-badges">
                  {totalVerdict && (
                    <span className={`portfolio-verdict verdict-${totalVerdict.kind}`}>
                      {totalVerdict.kind === 'fair'
                        ? 'Fairly valued vs. market'
                        : totalVerdict.kind === 'undervalued'
                          ? `Market ${formatPercent(Math.abs(totalVerdict.deviation)).replace('+', '')} / ${marketFairGap} below fair`
                          : `Market ${formatPercent(Math.abs(totalVerdict.deviation)).replace('+', '')} / ${marketFairGap} above fair`}
                    </span>
                  )}
                  {totals.unreal && (
                    <span
                      className={`portfolio-verdict ${totals.unreal.euro >= 0 ? 'verdict-undervalued' : 'verdict-overvalued'}`}
                    >
                      {signedEuro(totals.unreal.euro).text} ({formatPercent(totals.unreal.euro / totals.unreal.base)}) vs.
                      paid
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {lots.length > 0 && <PortfolioHistoryChart qtyByCard={qtyByCard} />}

          {!cards ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="portfolio-list">
              {rows.map((r) => {
                const img = cardImage(r.card, 'low')
                const gap =
                  r.lineMarket != null && r.knownQty > 0 && r.market != null
                    ? { euro: r.market * r.knownQty - r.cost, base: r.cost }
                    : null
                const isAdding = action?.cardId === r.card.id && action.kind === 'add'
                const isSelling = action?.cardId === r.card.id && action.kind === 'sell'
                return (
                  <li key={r.card.id} className="portfolio-row">
                    {img ? (
                      <RetryImage src={img} alt={r.card.name} loading="lazy" placeholder={<div className="portfolio-thumb-ph" />} />
                    ) : (
                      <div className="portfolio-thumb-ph" />
                    )}
                    <div className="portfolio-row-main">
                      <a href={`/card/${r.card.id}`}>
                        <strong>{r.card.name}</strong>{' '}
                        <span className="muted">#{r.card.localId} · {r.card.rarity ?? 'unknown'}</span>
                      </a>
                      <span className="muted">
                        {r.qty}×{' '}
                        {r.cost > 0
                          ? `bought ${formatEuro(r.cost / r.knownQty)} avg`
                          : 'no buy price'}{' '}
                        · {r.market != null ? formatEuro(r.market) : '–'} market · {formatEuro(r.fairEach)} fair each
                      </span>
                      {gap && (
                        <span className={`portfolio-gap ${gap.euro >= 0 ? 'pl-pos' : 'pl-neg'}`}>
                          {signedEuro(gap.euro).text} ({formatPercent(gap.euro / gap.base)}) vs. paid
                        </span>
                      )}
                    </div>
                    <div className="portfolio-row-value">
                      <strong>{r.lineMarket != null ? formatEuro(r.lineMarket) : '–'}</strong>
                      <span className="muted">{formatEuro(r.lineFair)} fair</span>
                    </div>
                    <div className="portfolio-row-actions">
                      {isAdding || isSelling ? (
                        <form
                          className="portfolio-inline-form"
                          onSubmit={(e) => {
                            e.preventDefault()
                            submitAction()
                          }}
                        >
                          <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            onKeyDown={(e) => e.key === 'Escape' && setAction(null)}
                            placeholder={isSelling ? 'Sold for €' : 'Price paid €'}
                            aria-label={isSelling ? 'Sale price' : 'Purchase price'}
                          />
                          <button type="submit" className="portfolio-btn">
                            {isSelling ? 'Sell' : 'Add'}
                          </button>
                          <button type="button" className="portfolio-add-cancel" aria-label="Cancel" onClick={() => setAction(null)}>
                            ✕
                          </button>
                        </form>
                      ) : (
                        <>
                          <button type="button" className="portfolio-mini" title="Add another copy" onClick={() => openAction(r.card.id, 'add')}>
                            + Add
                          </button>
                          <button type="button" className="portfolio-mini" title="Sell one copy" onClick={() => openAction(r.card.id, 'sell')}>
                            Sell
                          </button>
                        </>
                      )}
                    </div>
                    <button type="button" className="tile-remove portfolio-remove" title="Remove from portfolio (no sale)" onClick={() => removeCard(r.card.id)}>
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {sales.length > 0 && (
            <section className="sales-log">
              <div className="sales-log-head">
                <h2>Sales</h2>
                {realized.known > 0 && (
                  <span className={`realized ${realized.sum >= 0 ? 'pl-pos' : 'pl-neg'}`}>
                    Realised {signedEuro(realized.sum).text}
                  </span>
                )}
              </div>
              <ul className="sales-list">
                {sortedSales.map((s: Sale) => {
                  const name = cards?.get(s.cardId)?.name ?? s.cardId
                  const pl = s.buy != null ? s.sell - s.buy : null
                  return (
                    <li key={s.ts} className="sales-row">
                      <span className="sales-date muted">{formatDate(new Date(s.ts).toISOString())}</span>
                      <a className="sales-name" href={`/card/${s.cardId}`}>
                        {name}
                      </a>
                      <span className="sales-prices muted">
                        {s.buy != null ? formatEuro(s.buy) : '–'} → {formatEuro(s.sell)}
                      </span>
                      {pl != null ? (
                        <span className={`sales-pl ${signedEuro(pl).cls}`}>{signedEuro(pl).text}</span>
                      ) : (
                        <span className="sales-pl muted">–</span>
                      )}
                      <button type="button" className="tile-remove" title="Delete this ledger entry" onClick={() => deleteSale(s.ts)}>
                        ✕
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
