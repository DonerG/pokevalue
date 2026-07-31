import { isWatched, portfolioQty, setPortfolioQty, toggleWatch, usePortfolio, useWatchlist } from '../logic/collection'

/**
 * The watch / add-to-portfolio icons overlaid on a card tile in a grid, so a
 * card can be collected without opening it. The tile itself is a link, so each
 * button stops the click from navigating.
 */
export function CardQuickActions({ cardId }: { cardId: string }) {
  useWatchlist()
  usePortfolio()
  const watched = isWatched(cardId)
  const qty = portfolioQty(cardId)

  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
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
        title={qty > 0 ? `${qty} in portfolio — add one` : 'Add to portfolio'}
        aria-label="Add one to portfolio"
        onClick={(e) => {
          stop(e)
          setPortfolioQty(cardId, qty + 1)
        }}
      >
        <span className="quick-portfolio">+{qty > 0 ? qty : ''}</span>
      </button>
    </div>
  )
}
