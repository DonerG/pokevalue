import { useMemo, useState } from 'react'
import { formatDate, SETS, setLogo, type SetMeta } from '../data/cards'
import { RetryImage } from '../components/RetryImage'

function groupBySeries(sets: SetMeta[]): [string, SetMeta[]][] {
  const groups = new Map<string, SetMeta[]>()
  for (const s of sets) {
    const key = s.serie ?? 'Other'
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  // SETS is already sorted newest-release-first, so the first time each serie
  // is encountered while iterating already puts groups in that same order.
  return [...groups.entries()]
}

export function HomePage() {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? SETS.filter((s) => s.name.toLowerCase().includes(q)) : SETS
    return groupBySeries(filtered)
  }, [query])

  return (
    <div className="home">
      <section className="hero-block">
        <h2>What is a Pokémon card really worth?</h2>
        <p>
          PokéValue estimates a fair price for every card with a regression model trained on real
          Cardmarket data across ~19,000 cards — Pokémon, rarity, illustrator, set, and card type
          each get their own computed factor. Compare the result with the current market price and
          see instantly whether a card is over- or undervalued. For your specific copy, you only
          need to set condition and language.
        </p>
      </section>

      <div className="home-header">
        <h3 className="section-title">Sets in the system</h3>
        <input
          type="search"
          placeholder="Search sets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sets"
        />
      </div>

      {groups.map(([serie, sets]) => (
        <section key={serie} className="serie-group">
          <h4 className="serie-title">{serie}</h4>
          <div className="set-grid">
            {sets.map((s) => {
              const logo = setLogo(s)
              return (
                <a key={s.id} className="set-tile" href={`#/set/${s.id}`}>
                  {logo ? (
                    <RetryImage
                      src={logo}
                      alt=""
                      loading="lazy"
                      placeholder={<span className="set-tile-name">{s.name}</span>}
                    />
                  ) : (
                    <span className="set-tile-name">{s.name}</span>
                  )}
                  <div className="set-tile-meta">
                    <strong>{s.name}</strong>
                    <span>
                      {formatDate(s.releaseDate)} · {s.cardCount} cards
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      ))}
      {groups.length === 0 && <p className="muted">No set found.</p>}

      <p className="muted">More sets are added step by step.</p>
    </div>
  )
}
