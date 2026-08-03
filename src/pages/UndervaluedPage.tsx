import { useEffect, useMemo, useState } from 'react'
import { formatEuro } from '../logic/pricing'
import { loadMovers, loadUndervalued, type Movers, type UndervaluedPick, type Mover } from '../data/cards'
import { RetryImage } from '../components/RetryImage'
import { CardQuickActions } from '../components/CardQuickActions'
import { useDocumentMeta } from '../logic/documentMeta'

const DOT_CLASS: Record<string, string> = { u: 'dot-u', f: 'dot-f', o: 'dot-o' }

function Dots({ views }: { views: string[] }) {
  return (
    <span className="pick-dots" aria-label="agreement of the three views">
      {views.map((v, i) => (
        <span key={i} className={`pick-dot ${DOT_CLASS[v] ?? 'dot-f'}`} />
      ))}
    </span>
  )
}

function MoverRow({ m, kind }: { m: Mover; kind: 'up' | 'down' }) {
  const img = m.image ? `${m.image}/low.webp` : null
  return (
    <a className="mover-row" href={`/card/${m.id}`}>
      {img ? (
        <RetryImage src={img} alt={m.name} loading="lazy" placeholder={<div className="mover-thumb-ph" />} />
      ) : (
        <div className="mover-thumb-ph" />
      )}
      <div className="mover-main">
        <strong>{m.name}</strong>
        <span className="muted">
          #{m.localId} · {m.setName} · {formatEuro(m.market)}
        </span>
      </div>
      <span className={kind === 'up' ? 'mover-delta up' : 'mover-delta down'}>
        {m.delta > 0 ? '+' : ''}
        {m.delta} pts
      </span>
    </a>
  )
}

export function UndervaluedPage() {
  useDocumentMeta(
    'Undervalued Pokémon cards',
    'The cards trading furthest below their fair price, and the biggest daily movers — from the PokéValue model.',
    '/undervalued',
    null,
  )
  const [picks, setPicks] = useState<UndervaluedPick[] | null>(null)
  const [movers, setMovers] = useState<Movers | null>(null)
  const [onlyUnanimous, setOnlyUnanimous] = useState(false)
  const [minGap, setMinGap] = useState(false)
  const [sortKey, setSortKey] = useState<'upside' | 'diff'>('upside')

  useEffect(() => {
    loadUndervalued().then(setPicks)
    loadMovers().then(setMovers).catch(() => setMovers(null))
  }, [])

  const LIMIT = 100
  const shown = useMemo(() => {
    const filtered = (picks ?? []).filter(
      (p) => (!onlyUnanimous || p.unanimous) && (!minGap || p.diff > 2),
    )
    filtered.sort((a, b) => (sortKey === 'diff' ? b.diff - a.diff : b.upside - a.upside))
    return filtered.slice(0, LIMIT)
  }, [picks, onlyUnanimous, minGap, sortKey])
  const hasMovers = movers && (movers.up.length > 0 || movers.down.length > 0)

  return (
    <div className="undervalued-page">
      <h1>Undervalued</h1>
      <p className="muted intro">
        Cards trading furthest below the fair price our model computes. Three dots show whether the
        wide, standard and close-up views all agree — three green is the strongest signal. Only cards
        at €1 or more, so a one-cent wobble doesn't distort the list.
      </p>

      {hasMovers && (
        <section className="movers">
          <h2>Biggest movers</h2>
          <p className="muted">
            Where the valuation shifted most since the previous daily update{movers ? ` (${movers.asOf})` : ''}.
          </p>
          <div className="movers-cols">
            <div className="movers-col">
              <h3 className="movers-title up">📈 More undervalued</h3>
              {movers!.up.map((m) => (
                <MoverRow key={m.id} m={m} kind="up" />
              ))}
            </div>
            <div className="movers-col">
              <h3 className="movers-title down">📉 More overvalued</h3>
              {movers!.down.map((m) => (
                <MoverRow key={m.id} m={m} kind="down" />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="picks">
        <div className="picks-head">
          <h2>Most undervalued</h2>
          <div className="picks-controls">
            <div className="sort-toggle" role="group" aria-label="Sort by">
              <button
                type="button"
                className={sortKey === 'upside' ? 'active' : ''}
                onClick={() => setSortKey('upside')}
                title="Biggest percentage gap first"
              >
                By upside %
              </button>
              <button
                type="button"
                className={sortKey === 'diff' ? 'active' : ''}
                onClick={() => setSortKey('diff')}
                title="Biggest euro gap first"
              >
                By € gap
              </button>
            </div>
            <label className="admin-checkbox">
              <input type="checkbox" checked={minGap} onChange={(e) => setMinGap(e.target.checked)} />
              Only gap over €2
            </label>
            <label className="admin-checkbox">
              <input type="checkbox" checked={onlyUnanimous} onChange={(e) => setOnlyUnanimous(e.target.checked)} />
              Only unanimous (three green dots)
            </label>
          </div>
        </div>
        <p className="muted picks-note">Top {LIMIT} cards, {sortKey === 'diff' ? 'biggest euro gap' : 'biggest percentage upside'} first.</p>

        {!picks ? (
          <p className="muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="muted">No cards match.</p>
        ) : (
          <div className="card-grid">
            {shown.map((p) => {
              const img = p.image ? `${p.image}/low.webp` : null
              return (
                <div key={p.id} className="card-tile pick-tile">
                  <CardQuickActions cardId={p.id} />
                  <a className="card-tile-link" href={`/card/${p.id}`}>
                    {img ? (
                      <RetryImage src={img} alt={p.name} loading="lazy" placeholder={<div className="card-tile-placeholder">{p.name}</div>} />
                    ) : (
                      <div className="card-tile-placeholder">{p.name}</div>
                    )}
                    <div className="card-tile-body">
                      <div className="card-tile-name-block">
                        <strong>{p.name}</strong>
                        <span className="muted">#{p.localId} · {p.setName}</span>
                      </div>
                      <div className="pick-value">
                        <span className="pick-upside">+{p.upside}%</span>
                        <span className="pick-gap">+{formatEuro(p.diff)}</span>
                        <Dots views={p.views} />
                      </div>
                      <span className="muted pick-prices">
                        {formatEuro(p.market)} → {formatEuro(p.fair)} fair
                      </span>
                    </div>
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
