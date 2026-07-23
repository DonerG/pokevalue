import { useEffect, useMemo, useState } from 'react'
import type { Config } from '../data/defaults'
import { formatEuro } from '../logic/pricing'
import { cardImage, formatDate, getSet, loadCards, type CardData } from '../data/cards'
import { updateSetFilters, type SetSortKey } from '../router'
import { VerdictChip } from '../components/VerdictChip'

interface Props {
  setId: string
  initialQuery: string
  initialSort: SetSortKey
  config: Config
}

export function SetPage({ setId, initialQuery, initialSort, config }: Props) {
  const set = getSet(setId)
  const [cards, setCards] = useState<CardData[] | null>(null)
  const [query, setQuery] = useState(initialQuery)
  const [sort, setSort] = useState<SetSortKey>(initialSort)

  useEffect(() => {
    setCards(null)
    loadCards(setId).then(setCards)
  }, [setId])

  // Keep the URL in sync (without spamming history) so the filters survive
  // opening a card and going back — see router.ts.
  useEffect(() => {
    updateSetFilters(setId, query, sort)
  }, [setId, query, sort])

  const rows = useMemo(() => {
    if (!cards) return []
    const withPrice = cards.map((card) => {
      const fair = card.baseValue
      const market = card.market?.trend ?? null
      const deviation = market != null && fair > 0 ? (market - fair) / fair : null
      return { card, fair, market, deviation }
    })
    const q = query.trim().toLowerCase()
    const filtered = q
      ? withPrice.filter((r) => r.card.name.toLowerCase().includes(q) || r.card.localId.includes(q))
      : withPrice
    const sorted = [...filtered]
    if (sort === 'deviation')
      sorted.sort((a, b) => (a.deviation ?? Infinity) - (b.deviation ?? Infinity))
    if (sort === 'market') sorted.sort((a, b) => (b.market ?? -1) - (a.market ?? -1))
    if (sort === 'fair') sorted.sort((a, b) => b.fair - a.fair)
    return sorted
  }, [cards, config, query, sort])

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
          {formatDate(set.releaseDate)} · {set.cardCount} cards. Fair price from our pricing model
          vs. the current Cardmarket trend price.
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
            <select value={sort} onChange={(e) => setSort(e.target.value as SetSortKey)}>
              <option value="number">Number</option>
              <option value="deviation">Deviation (undervalued first)</option>
              <option value="market">Market price (highest first)</option>
              <option value="fair">Fair price (highest first)</option>
            </select>
          </label>
        </div>
      </header>

      {!cards && <p className="muted">Loading cards…</p>}

      {cards && (
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
                    <span title="Cardmarket trend price">
                      Market {market != null ? formatEuro(market) : '–'}
                    </span>
                    <span title="Fair price per the formula">Fair {formatEuro(fair)}</span>
                  </span>
                  <VerdictChip market={market} fair={fair} config={config} />
                </div>
              </a>
            )
          })}
        </div>
      )}
      {cards && rows.length === 0 && <p className="muted">No card found.</p>}
    </div>
  )
}
