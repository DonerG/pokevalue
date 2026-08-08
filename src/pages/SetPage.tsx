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

// Desktop card-grid density, remembered across sets.
const DENSITY_KEY = 'pokevalue-grid-density-v1'
type Density = 'normal' | 'large'
function loadDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'large' ? 'large' : 'normal'
  } catch {
    return 'normal'
  }
}

// Sort mechanism + direction, remembered globally across sets until changed —
// so a sort chosen on one set applies to every set you open next.
const SORT_KEY = 'pokevalue-set-sort-v1'
const SORT_DIR_KEY = 'pokevalue-set-sortdir-v1'
type SortDir = 'asc' | 'desc'
const SORTS: SetSortKey[] = ['number', 'deviation', 'market', 'gap']
// The order each sort starts in (its natural direction); the reverse button flips it.
const DEFAULT_DIR: Record<SetSortKey, SortDir> = {
  number: 'asc',
  deviation: 'asc',
  market: 'desc',
  gap: 'desc',
}
function loadSortPref(fallback: SetSortKey): SetSortKey {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return v && SORTS.includes(v as SetSortKey) ? (v as SetSortKey) : fallback
  } catch {
    return fallback
  }
}
function loadDirPref(sort: SetSortKey): SortDir {
  try {
    const v = localStorage.getItem(SORT_DIR_KEY)
    return v === 'asc' || v === 'desc' ? v : DEFAULT_DIR[sort]
  } catch {
    return DEFAULT_DIR[sort]
  }
}
function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // preference just won't persist
  }
}

export function SetPage({ setId, initialQuery, initialSort, initialMinPrice, config }: Props) {
  const set = getSet(setId)
  const [cards, setCards] = useState<CardData[] | null>(null)
  const [query, setQuery] = useState(initialQuery)
  const [sort, setSort] = useState<SetSortKey>(() => loadSortPref(initialSort))
  const [dir, setDir] = useState<SortDir>(() => loadDirPref(loadSortPref(initialSort)))
  const [minPrice, setMinPrice] = useState(initialMinPrice)
  const [density, setDensity] = useState<Density>(loadDensity)

  const changeDensity = (d: Density) => {
    setDensity(d)
    try {
      localStorage.setItem(DENSITY_KEY, d)
    } catch {
      // preference just won't persist
    }
  }

  // Picking a sort resets to its natural direction; the reverse button flips it.
  // Both are saved so the choice carries to every other set.
  const changeSort = (key: SetSortKey) => {
    const d = DEFAULT_DIR[key]
    setSort(key)
    setDir(d)
    savePref(SORT_KEY, key)
    savePref(SORT_DIR_KEY, d)
  }
  const toggleDir = () => {
    setDir((prev) => {
      const next = prev === 'asc' ? 'desc' : 'asc'
      savePref(SORT_DIR_KEY, next)
      return next
    })
  }

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
    // Largest undervaluation in euros first: fair − market. Cards with no market
    // price sink to the bottom; overvalued cards (negative gap) trail the
    // undervalued ones.
    if (sort === 'gap') {
      const euroGap = (r: { fair: number; market: number | null }) =>
        r.market != null ? r.fair - r.market : -Infinity
      sorted.sort((a, b) => euroGap(b) - euroGap(a))
    }
    // The sorts above produce each key's natural order; flip it when reversed.
    if (dir !== DEFAULT_DIR[sort]) sorted.reverse()
    return sorted
  }, [cards, config, query, sort, dir, minPrice])

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
            <select value={sort} onChange={(e) => changeSort(e.target.value as SetSortKey)}>
              <option value="number">Number</option>
              <option value="deviation">Deviation (%)</option>
              <option value="gap">Deviation (€)</option>
              <option value="market">Market price</option>
            </select>
          </label>
          <button
            type="button"
            className="sort-dir"
            onClick={toggleDir}
            title="Reverse order"
            aria-label="Reverse sort order"
          >
            {dir === 'desc' ? '↓' : '↑'}
          </button>
          <label className="admin-checkbox">
            <input type="checkbox" checked={minPrice} onChange={(e) => setMinPrice(e.target.checked)} />
            Only ≥ €1 market price
          </label>
          <div className="density-toggle" role="group" aria-label="Card size">
            <button
              type="button"
              className={density === 'normal' ? 'active' : ''}
              onClick={() => changeDensity('normal')}
              title="More, smaller cards"
            >
              Compact
            </button>
            <button
              type="button"
              className={density === 'large' ? 'active' : ''}
              onClick={() => changeDensity('large')}
              title="Fewer, larger cards"
            >
              Large
            </button>
          </div>
        </div>
      </header>

      {!cards && <p className="muted">Loading cards…</p>}

      {cards && (
        <div className={density === 'large' ? 'card-grid is-large' : 'card-grid'}>
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
                      <VerdictChip market={market} fair={fair} config={config} withEuro />
                    </div>
                    {density === 'large' && (
                      <div
                        className="card-tile-fairs"
                        title="The three model views behind the fair price — their median is the fair price above"
                      >
                        <span>
                          <span className="fair-view-label">Wide</span> {formatEuro(card.fairs.broad)}
                        </span>
                        <span>
                          <span className="fair-view-label">Standard</span> {formatEuro(card.fairs.standard)}
                        </span>
                        <span>
                          <span className="fair-view-label">Close-up</span> {formatEuro(card.fairs.local)}
                        </span>
                      </div>
                    )}
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
