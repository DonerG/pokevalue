import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { defaultConfig } from './data/defaults'
import { useRoute } from './router'
import { useAdminUnlocked } from './logic/adminGate'
import { seedAdminStores } from './logic/adminSeed'
import { AdminBar } from './components/AdminBar'
import { HomePage } from './pages/HomePage'
import { SetPage } from './pages/SetPage'
import { CardPage } from './pages/CardPage'

const AdminHubPage = lazy(() =>
  import('./pages/AdminHubPage').then((m) => ({ default: m.AdminHubPage })),
)
const AdminArtworkPage = lazy(() =>
  import('./pages/AdminArtworkPage').then((m) => ({ default: m.AdminArtworkPage })),
)
const AdminTeraPage = lazy(() =>
  import('./pages/AdminTeraPage').then((m) => ({ default: m.AdminTeraPage })),
)
const AdminCorrectionsPage = lazy(() =>
  import('./pages/AdminCorrectionsPage').then((m) => ({ default: m.AdminCorrectionsPage })),
)
const AdminPriceAuditPage = lazy(() =>
  import('./pages/AdminPriceAuditPage').then((m) => ({ default: m.AdminPriceAuditPage })),
)
const HowItWorksPage = lazy(() =>
  import('./pages/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })),
)

// Fixed for every visitor — pricing is model-driven, not user-tunable. See PriceBreakdown for the "why this number" explanation.
const CONFIG = defaultConfig()

const ADMIN_PAGES = new Set(['admin-hub', 'admin-artwork', 'admin-tera', 'admin-price-audit'])

function App() {
  const route = useRoute()
  const unlocked = useAdminUnlocked()
  const onAdminRoute = ADMIN_PAGES.has(route.page)

  // Once unlocked, load the committed data into the editing stores so the
  // per-card editor reflects the real current state (see adminSeed).
  useEffect(() => {
    if (unlocked) seedAdminStores()
  }, [unlocked])

  // Keep the admin area out of any index that runs JS. The pages are already
  // unlinked and absent from the sitemap; this is the belt to that's braces.
  useEffect(() => {
    if (!onAdminRoute) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [onAdminRoute])

  // Every admin route but the hub is gated: locked → show the hub (which is the
  // unlock form when locked); unlocked → the requested page.
  const gated = (node: ReactNode): ReactNode =>
    unlocked ? (
      node
    ) : (
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <AdminHubPage />
      </Suspense>
    )

  return (
    <div className="app">
      <AdminBar />
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
      {route.page === 'admin-hub' && (
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <AdminHubPage />
        </Suspense>
      )}
      {route.page === 'admin-artwork' &&
        gated(
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <AdminArtworkPage />
          </Suspense>,
        )}
      {route.page === 'admin-tera' &&
        gated(
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <AdminTeraPage />
          </Suspense>,
        )}
      {route.page === 'admin-corrections' &&
        gated(
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <AdminCorrectionsPage />
          </Suspense>,
        )}
      {route.page === 'admin-price-audit' &&
        gated(
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <AdminPriceAuditPage />
          </Suspense>,
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
