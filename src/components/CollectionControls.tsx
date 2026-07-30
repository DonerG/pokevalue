import { isWatched, portfolioQty, setPortfolioQty, toggleWatch, useWatchlist, usePortfolio } from '../logic/collection'

/**
 * Watch toggle and portfolio quantity for a card, shown on its page. Public —
 * everything is this browser's own localStorage (see logic/collection). The
 * hooks are read so the control re-renders when the same card is changed from
 * the watchlist/portfolio pages in another tab of the app.
 */
export function CollectionControls({ cardId }: { cardId: string }) {
  useWatchlist()
  usePortfolio()
  const watched = isWatched(cardId)
  const qty = portfolioQty(cardId)

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
        {qty > 0 ? (
          <div className="qty-stepper" role="group" aria-label="Quantity in portfolio">
            <button type="button" onClick={() => setPortfolioQty(cardId, qty - 1)} aria-label="One fewer">
              −
            </button>
            <span className="qty-value">{qty} in portfolio</span>
            <button type="button" onClick={() => setPortfolioQty(cardId, qty + 1)} aria-label="One more">
              +
            </button>
          </div>
        ) : (
          <button type="button" className="portfolio-btn" onClick={() => setPortfolioQty(cardId, 1)}>
            + Add to portfolio
          </button>
        )}
      </div>
    </div>
  )
}
