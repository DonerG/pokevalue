import { useEffect, useMemo, useState } from 'react'
import { loadSearchIndex, type SearchIndexCard } from '../data/cards'
import { useDocumentMeta } from '../logic/documentMeta'

interface TopCard {
  card: string
  count: number
}
interface Stats {
  watchlistAdds: number
  portfolioAdds: number
  topWatch: TopCard[]
  topPortfolio: TopCard[]
}

const TOKEN_KEY = 'pokevalue-usage-token'

export function AdminUsagePage() {
  useDocumentMeta('Usage', 'Anonymous aggregate usage of watchlist and portfolio.', '/admin/usage', null)
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [stats, setStats] = useState<Stats | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [index, setIndex] = useState<Map<string, SearchIndexCard> | null>(null)

  useEffect(() => {
    loadSearchIndex().then((cards) => setIndex(new Map(cards.map((c) => [c.id, c]))))
  }, [])

  const load = async (t: string) => {
    if (!t) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/usage-stats?token=${encodeURIComponent(t)}`)
      if (res.status === 401) {
        setStatus('Wrong token.')
        setStats(null)
      } else if (res.status === 503) {
        const j = await res.json().catch(() => ({}))
        setStatus(j.error ?? 'Not configured on the server yet.')
        setStats(null)
      } else if (!res.ok) {
        setStatus(`Error ${res.status}.`)
        setStats(null)
      } else {
        setStats((await res.json()) as Stats)
        try {
          localStorage.setItem(TOKEN_KEY, t)
        } catch {
          // token just won't persist
        }
      }
    } catch {
      setStatus('Could not reach the server (works only on the deployed site).')
      setStats(null)
    } finally {
      setBusy(false)
    }
  }

  // Auto-load once if a token was remembered.
  useEffect(() => {
    if (token) load(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nameOf = useMemo(
    () => (id: string) => {
      const c = index?.get(id)
      return c ? `${c.name} · ${c.setName} #${c.localId}` : id
    },
    [index],
  )

  const list = (rows: TopCard[]) =>
    rows.length === 0 ? (
      <p className="muted">No adds recorded yet.</p>
    ) : (
      <ol className="usage-top">
        {rows.map((r) => (
          <li key={r.card}>
            <a href={`/card/${r.card}`}>{nameOf(r.card)}</a>
            <span className="usage-count">{r.count}</span>
          </li>
        ))}
      </ol>
    )

  return (
    <div className="admin-hub usage-page">
      <header className="admin-header">
        <h2>Usage</h2>
        <p className="muted">
          Anonymous, aggregate counts of watchlist and portfolio adds — no visitor is identified. Only
          the counters are stored. Enter the <strong>USAGE_TOKEN</strong> you set in the Vercel
          environment to read them.
        </p>
        <form
          className="admin-unlock-form"
          onSubmit={(e) => {
            e.preventDefault()
            load(token)
          }}
        >
          <input
            type="password"
            value={token}
            placeholder="USAGE_TOKEN"
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" disabled={busy || !token}>
            {busy ? 'Loading…' : 'Load'}
          </button>
        </form>
        {status && <p className="admin-unlock-error">{status}</p>}
      </header>

      {stats && (
        <>
          <section className="portfolio-summary">
            <div className="portfolio-total">
              <span className="muted">Watchlist adds</span>
              <strong>{stats.watchlistAdds.toLocaleString('en-GB')}</strong>
            </div>
            <div className="portfolio-total">
              <span className="muted">Portfolio adds</span>
              <strong>{stats.portfolioAdds.toLocaleString('en-GB')}</strong>
            </div>
          </section>

          <div className="usage-cols">
            <section>
              <h3>Most-watched cards</h3>
              {list(stats.topWatch)}
            </section>
            <section>
              <h3>Most-added to portfolios</h3>
              {list(stats.topPortfolio)}
            </section>
          </div>

          <p className="muted admin-hub-note">
            Counts are total add actions (one person adding five cards is five), collected since this
            feature went live. For unique visitors, see Vercel Analytics.
          </p>
        </>
      )}
    </div>
  )
}
