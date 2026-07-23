import { lazy, Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { defaultConfig } from './data/defaults'
import { useRoute } from './router'
import { HomePage } from './pages/HomePage'
import { SetPage } from './pages/SetPage'
import { CardPage } from './pages/CardPage'

const AdminArtworkPage = lazy(() =>
  import('./pages/AdminArtworkPage').then((m) => ({ default: m.AdminArtworkPage })),
)
const AdminPromoStylePage = lazy(() =>
  import('./pages/AdminPromoStylePage').then((m) => ({ default: m.AdminPromoStylePage })),
)

// Fixed for every visitor — pricing is model-driven, not user-tunable. See PriceBreakdown for the "why this number" explanation.
const CONFIG = defaultConfig()

function App() {
  const route = useRoute()

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#/">
          <span className="pokeball" aria-hidden="true" />
          <h1>PokéValue</h1>
        </a>
        <nav className="main-nav">
          <a href="#/" className={route.page === 'home' || route.page === 'set' || route.page === 'card' ? 'active' : ''}>
            Sets
          </a>
        </nav>
      </header>

      {route.page === 'home' && <HomePage />}
      {route.page === 'set' && (
        <SetPage
          key={route.setId}
          setId={route.setId}
          initialQuery={route.query}
          initialSort={route.sort}
          config={CONFIG}
        />
      )}
      {route.page === 'card' && <CardPage key={route.cardId} cardId={route.cardId} config={CONFIG} />}
      {route.page === 'admin-artwork' && (
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <AdminArtworkPage />
        </Suspense>
      )}
      {route.page === 'admin-promo-style' && (
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <AdminPromoStylePage />
        </Suspense>
      )}

      <footer className="app-footer">
        PokéValue estimates a fair price from real Cardmarket data across thousands of cards using
        a machine-learning model — not a hand-tuned formula. Not financial advice. Card data and
        prices from{' '}
        <a href="https://tcgdex.dev" target="_blank" rel="noreferrer">
          TCGdex
        </a>{' '}
        (Cardmarket). Unofficial fan project — not endorsed or supported by Nintendo, Game Freak, or
        The Pokémon Company.
      </footer>
      <Analytics />
    </div>
  )
}

export default App
