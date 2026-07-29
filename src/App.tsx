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
const AdminPriceAuditPage = lazy(() =>
  import('./pages/AdminPriceAuditPage').then((m) => ({ default: m.AdminPriceAuditPage })),
)
const HowItWorksPage = lazy(() =>
  import('./pages/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })),
)

// Fixed for every visitor — pricing is model-driven, not user-tunable. See PriceBreakdown for the "why this number" explanation.
const CONFIG = defaultConfig()

function App() {
  const route = useRoute()

  return (
    <div className="app">
      <header className="app-header">
        {/* Deliberately NOT an <h1>: this logo is on all 4,400+ pages, so as an
            h1 it told a crawler the same thing about every one of them and the
            page's real subject (the card, the set) was demoted to an h2. Each
            page now owns its single descriptive h1 — which is also what the
            prerendered HTML in scripts/prerender.mjs has always emitted. */}
        <a className="brand" href="/">
          <span className="pokeball" aria-hidden="true" />
          <span className="brand-name">PokéValue</span>
        </a>
        <nav className="main-nav">
          <a href="/" className={route.page === 'home' || route.page === 'set' || route.page === 'card' ? 'active' : ''}>
            Sets
          </a>
          <a href="/how-it-works" className={route.page === 'how-it-works' ? 'active' : ''}>
            How it works
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
          initialMinPrice={route.minPrice}
          config={CONFIG}
        />
      )}
      {route.page === 'card' && <CardPage key={route.cardId} cardId={route.cardId} config={CONFIG} />}
      {route.page === 'how-it-works' && (
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <HowItWorksPage />
        </Suspense>
      )}
      {route.page === 'admin-artwork' && (
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <AdminArtworkPage />
        </Suspense>
      )}
      {route.page === 'admin-price-audit' && (
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <AdminPriceAuditPage />
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
