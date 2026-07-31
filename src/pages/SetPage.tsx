import { useEffect, useMemo, useState } from 'react'
import type { Config } from '../data/defaults'
import { formatEuro } from '../logic/pricing'
import { cardImage, formatDate, getSet, loadCards, setLogo, type CardData } from '../data/cards'
import { currentLocationKey, restoreScrollSoon, updateSetFilters, type SetSortKey } from '../router'
import { useDocumentMeta } from '../logic/documentMeta'
import { setMeta as buildSetMeta } from '../logic/pageMeta.js'
import { VerdictChip } from '../components/VerdictChip'
import { RetryImage } from '../components/RetryImage'
import { CardQuickActions } from '../components/CardQuickActions'
import { setNavList } from '../logic/cardNav'

interface Props {
  setId: string
  initialQuery: string
  initialSort: SetSortKey
  initialMinPrice: boolean
  config: Config
}

export function SetPage({ setId, initialQuery, initialSort, initialMinPrice, config }: Props) {
  const set = getSet(setId)
  const [cards, setCards] = useState<CardData[] | null>(null)
  const [query, setQuery] = useState(initialQuery)
  const [sort, setSort] = useState<SetSortKey>(initialSort)
  const [minPrice, setMinPrice] = useState(initialMinPrice)

  useEffect(() => {
    setCards(null)
    loadCards(setId).then((loaded) => {
      setCards(loaded)
      // Only reaches full height once cards are in, so a scroll restore
      // attempted right on navigation (see router.ts) would've had nowhere
      // to go yet — try again now that the grid actually has its content.
      restoreScrollSoon(currentLocationKey())
    })
  }, [setId])

  // Keep the URL in sync (without spamming history) so the filters survive
  // opening a card and going back — see router.ts.
  useEffect(() => {
    updateSetFilters(setId, query, sort, minPrice)
  }, [setId, query, sort, minPrice])

  const rows = useMemo(() => {
    if (!cards) return []
    const withPrice = cards.map((card) => {
      const fair = card.baseValue
      const market = card.market?.trend ?? null
      const deviation = market != null && fair > 0 ? (market - fair) / fair : null
      return { card, fair, market, deviation }
    })
    const q = query.trim().toLowerCase()
    let filtered = q
      ? withPrice.filter((r) => r.card.name.toLowerCase().includes(q) || r.card.localId.includes(q))
      : withPrice
    // Below ~€1, a card's whole price is close to noise — a 20-cent swing
    // reads as a huge percentage but isn't actually a meaningful find.
    if (minPrice) filtered = filtered.filter((r) => r.market != null && r.market >= 1)
    const sorted = [...filtered]
    if (sort === 'deviation')
      sorted.sort((a, b) => (a.deviation ?? Infinity) - (b.deviation ?? Infinity))
    if (sort === 'market') sorted.sort((a, b) => (b.market ?? -1) - (a.market ?? -1))
    if (sort === 'fair') sorted.sort((a, b) => b.fair - a.fair)
    return sorted
  }, [cards, config, query, sort, minPrice])

  // Remember this exact order so a card page can offer prev/next through it.
  useEffect(() => {
    setNavList(rows.map((r) => r.card.id))
  }, [rows])

  const meta = buildSetMeta(set)
  useDocumentMeta(meta.title, meta.description, `/set/${setId}`, set ? setLogo(set) : null)

  if (!set) {
    return (
      <p className="muted">
        Set not found. <a href="/">Back to overview</a>
      </p>
    )
  }

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/">Sets</a> / <strong>{set.name}</strong>
      </nav>
      <header className="set-header">
        <h1>{set.name}</h1>
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
          <label className="admin-checkbox">
            <input type="checkbox" checked={minPrice} onChange={(e) => setMinPrice(e.target.checked)} />
            Only ≥ €1 market price
          </label>
        </div>
      </header>

      {!cards && <p className="muted">Loading cards…</p>}

      {cards && (
        <div className="card-grid">
          {rows.map(({ card, fair, market }) => {
            const img = cardImage(card, 'low')
            return (
              <div key={card.id} className="card-tile">
                <CardQuickActions cardId={card.id} />
                <a className="card-tile-link" href={`/card/${card.id}`}>
                  {img ? (
                    <RetryImage
                      src={img}
                      alt={card.name}
                      loading="lazy"
                      placeholder={<div className="card-tile-placeholder">{card.name}</div>}
                    />
                  ) : (
                    <div className="card-tile-placeholder">{card.name}</div>
                  )}
                  <div className="card-tile-body">
                    <div className="card-tile-name-block">
                      <strong>{card.name}</strong>
                      <span className="muted">
                        #{card.localId} · {card.rarity ?? 'unknown'}
                      </span>
                    </div>
                    <div className="card-tile-value-block">
                      <span title="Cardmarket trend price">
                        Market {market != null ? formatEuro(market) : '–'}
                      </span>
                      <span title="Fair price per the formula">Fair {formatEuro(fair)}</span>
                      <VerdictChip market={market} fair={fair} config={config} fairs={card.fairs} />
                    </div>
                  </div>
                </a>
              </div>
            )
          })}
        </div>
      )}
      {cards && rows.length === 0 && <p className="muted">No card found.</p>}
    </div>
  )
}
