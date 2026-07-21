import { useMemo, useState } from 'react'
import type { Config } from '../data/defaults'
import { baseValue, formatEuro } from '../logic/pricing'
import { cardImage, formatDate, getCards, getSet, selectionForCard } from '../data/cards'
import { VerdictChip } from '../components/VerdictChip'

type SortKey = 'number' | 'deviation' | 'market' | 'fair'

interface Props {
  setId: string
  config: Config
}

export function SetPage({ setId, config }: Props) {
  const set = getSet(setId)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('number')

  const rows = useMemo(() => {
    const cards = getCards(setId).map((card) => {
      const fair = baseValue(selectionForCard(card), config)
      const market = card.market?.trend ?? null
      const deviation = market != null && fair > 0 ? (market - fair) / fair : null
      return { card, fair, market, deviation }
    })
    const q = query.trim().toLowerCase()
    const filtered = q
      ? cards.filter((r) => r.card.name.toLowerCase().includes(q) || r.card.localId.includes(q))
      : cards
    const sorted = [...filtered]
    if (sort === 'deviation')
      sorted.sort((a, b) => (a.deviation ?? Infinity) - (b.deviation ?? Infinity))
    if (sort === 'market') sorted.sort((a, b) => (b.market ?? -1) - (a.market ?? -1))
    if (sort === 'fair') sorted.sort((a, b) => b.fair - a.fair)
    return sorted
  }, [setId, config, query, sort])

  if (!set) {
    return (
      <p className="muted">
        Set not found. <a href="#/">Back to overview</a>
      </p>
    )
  }

  return (
    <div>
      <nav className="breadcrumb">
        <a href="#/">Sets</a> / <strong>{set.name}</strong>
      </nav>
      <header className="set-header">
        <h2>{set.name}</h2>
        <p className="muted">
          {set.serie ? `${set.serie} · ` : ''}
          {formatDate(set.releaseDate)} · {set.cardCount} cards. Fair price per the formula vs.
          Cardmarket trend price — presets per card, adjustable on the card page.
        </p>
        <div className="set-toolbar">
          <input
            type="search"
            placeholder="Search card (name or number)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search card"
          />
          <label>
            Sort by{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="number">Number</option>
              <option value="deviation">Deviation (undervalued first)</option>
              <option value="market">Market price (highest first)</option>
              <option value="fair">Fair price (highest first)</option>
            </select>
          </label>
        </div>
      </header>

      <div className="card-grid">
        {rows.map(({ card, fair, market }) => {
          const img = cardImage(card, 'low')
          return (
            <a key={card.id} className="card-tile" href={`#/card/${card.id}`}>
              {img ? (
                <img src={img} alt={card.name} loading="lazy" />
              ) : (
                <div className="card-tile-placeholder">{card.name}</div>
              )}
              <div className="card-tile-body">
                <strong>{card.name}</strong>
                <span className="muted">
                  #{card.localId} · {card.rarity ?? 'unknown'}
                </span>
                <span className="card-tile-prices">
                  <span title="Fair price per the formula">Fair {formatEuro(fair)}</span>
                  <span title="Cardmarket trend price">
                    Market {market != null ? formatEuro(market) : '–'}
                  </span>
                </span>
                <VerdictChip market={market} fair={fair} config={config} />
              </div>
            </a>
          )
        })}
      </div>
      {rows.length === 0 && <p className="muted">No card found.</p>}
    </div>
  )
}
