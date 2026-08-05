import { useState } from 'react'
import { addLot, isWatched, portfolioQty, toggleWatch, useWatchlist, usePortfolio } from '../logic/collection'

/**
 * Watch toggle and portfolio add for a card, shown on its page. Public —
 * everything is this browser's own localStorage (see logic/collection). Adding
 * to the portfolio opens a field for the price paid, which is stored with the
 * copy; managing/selling copies happens on the portfolio page.
 */
export function CollectionControls({ cardId }: { cardId: string }) {
  useWatchlist()
  usePortfolio()
  const watched = isWatched(cardId)
  const qty = portfolioQty(cardId)
  const [adding, setAdding] = useState(false)
  const [price, setPrice] = useState('')

  const submit = () => {
    const n = Number(price.replace(',', '.'))
    addLot(cardId, price.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null)
    setPrice('')
    setAdding(false)
  }

  return (
    <div className="collection-controls">
      <button
        type="button"
        className={watched ? 'watch-btn is-watched' : 'watch-btn'}
        onClick={() => toggleWatch(cardId)}
        aria-pressed={watched}
      >
        {watched ? '★ On watchlist' : '☆ Watch'}
      </button>

      <div className="portfolio-add">
        {qty > 0 && <span className="qty-value">{qty} in portfolio</span>}
        {adding ? (
          <form
            className="portfolio-add-form"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setAdding(false)
                  setPrice('')
                }
              }}
              placeholder="Price paid (€)"
              aria-label="Purchase price"
            />
            <button type="submit" className="portfolio-btn">
              Add
            </button>
            <button
              type="button"
              className="portfolio-add-cancel"
              aria-label="Cancel"
              onClick={() => {
                setAdding(false)
                setPrice('')
              }}
            >
              ✕
            </button>
          </form>
        ) : (
          <button type="button" className="portfolio-btn" onClick={() => setAdding(true)}>
            + Add to portfolio
          </button>
        )}
      </div>
    </div>
  )
}
