import { useEffect, useMemo, useState } from 'react'
import type { Config } from '../data/defaults'
import { cardImage, loadCardsByIds, type CardData } from '../data/cards'
import { formatEuro, verdict } from '../logic/pricing'
import { toggleWatch, useWatchlist } from '../logic/collection'
import { VerdictChip } from '../components/VerdictChip'
import { RetryImage } from '../components/RetryImage'
import { useDocumentMeta } from '../logic/documentMeta'

export function WatchlistPage({ config }: { config: Config }) {
  useDocumentMeta('Watchlist', 'Cards you are watching on PokéValue.', '/watchlist', null)
  const ids = useWatchlist()
  const [cards, setCards] = useState<CardData[] | null>(null)

  useEffect(() => {
    let live = true
    loadCardsByIds(ids).then((c) => live && setCards(c))
    return () => {
      live = false
    }
  }, [ids])

  // Most undervalued first — the whole point of watching.
  const rows = useMemo(() => {
    if (!cards) return []
    return cards
      .map((card) => {
        const market = card.market?.trend ?? null
        const v = market != null ? verdict(market, card.baseValue, config) : null
        return { card, market, deviation: v?.deviation ?? -Infinity }
      })
      .sort((a, b) => b.deviation - a.deviation)
  }, [cards, config])

  return (
    <div className="collection-page">
      <h1>Watchlist</h1>
      {ids.length === 0 ? (
        <p className="muted">
          No cards yet. Open any card and tap <strong>☆ Watch</strong> to add it here — sorted with
          the most undervalued on top.
        </p>
      ) : !cards ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="card-grid">
          {rows.map(({ card, market }) => {
            const img = cardImage(card, 'low')
            return (
              <div key={card.id} className="card-tile watch-tile">
                <button
                  type="button"
                  className="tile-remove"
                  title="Remove from watchlist"
                  onClick={() => toggleWatch(card.id)}
                >
                  ✕
                </button>
                <a className="card-tile-link" href={`/card/${card.id}`}>
                  {img ? (
                    <RetryImage src={img} alt={card.name} loading="lazy" placeholder={<div className="card-tile-placeholder">{card.name}</div>} />
                  ) : (
                    <div className="card-tile-placeholder">{card.name}</div>
                  )}
                  <div className="card-tile-body">
                    <div className="card-tile-name-block">
                      <strong>{card.name}</strong>
                      <span className="muted">#{card.localId} · {card.rarity ?? 'unknown'}</span>
                    </div>
                    <div className="card-tile-value-block">
                      <span>Market {market != null ? formatEuro(market) : '–'}</span>
                      <span>Fair {formatEuro(card.baseValue)}</span>
                      <VerdictChip market={market} fair={card.baseValue} config={config} fairs={card.fairs} />
                    </div>
                  </div>
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
