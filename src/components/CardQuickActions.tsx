import { useState } from 'react'
import { addLot, isWatched, portfolioQty, toggleWatch, usePortfolio, useWatchlist } from '../logic/collection'

/**
 * The watch / add-to-portfolio icons overlaid on a card tile in a grid, so a
 * card can be collected without opening it. The tile itself is a link, so each
 * button stops the click from navigating. Adding to the portfolio opens a small
 * inline field for the price paid — press Enter or tap ✓ to store the buy price
 * with the copy (see logic/collection lots).
 */
export function CardQuickActions({ cardId }: { cardId: string }) {
  useWatchlist()
  usePortfolio()
  const watched = isWatched(cardId)
  const qty = portfolioQty(cardId)
  const [adding, setAdding] = useState(false)
  const [price, setPrice] = useState('')

  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const submit = () => {
    const n = Number(price.replace(',', '.'))
    addLot(cardId, price.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null)
    setPrice('')
    setAdding(false)
  }

  return (
    <div className="quick-actions">
      <button
        type="button"
        className={watched ? 'quick-btn is-on' : 'quick-btn'}
        title={watched ? 'On watchlist' : 'Add to watchlist'}
        aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        aria-pressed={watched}
        onClick={(e) => {
          stop(e)
          toggleWatch(cardId)
        }}
      >
        {watched ? '★' : '☆'}
      </button>
      <button
        type="button"
        className={qty > 0 ? 'quick-btn is-on' : 'quick-btn'}
        title={qty > 0 ? `${qty} in portfolio — add another` : 'Add to portfolio'}
        aria-label="Add to portfolio"
        aria-expanded={adding}
        onClick={(e) => {
          stop(e)
          setAdding((v) => !v)
        }}
      >
        <span className="quick-portfolio">+{qty > 0 ? qty : ''}</span>
      </button>

      {adding && (
        <div className="quick-add" onClick={stop}>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              else if (e.key === 'Escape') {
                setAdding(false)
                setPrice('')
              }
            }}
            placeholder="€ paid"
            aria-label="Purchase price"
          />
          <button type="button" className="quick-add-ok" title="Add at this price" aria-label="Add at this price" onClick={submit}>
            ✓
          </button>
        </div>
      )}
    </div>
  )
}
