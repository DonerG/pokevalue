import { useEffect, useMemo, useState } from 'react'
import { formatDate, loadSearchIndex, SETS, setLogo, type SearchIndexCard, type SetMeta } from '../data/cards'
import { RetryImage } from '../components/RetryImage'
import { useDocumentMeta } from '../logic/documentMeta'

const MAX_CARD_RESULTS = 30

function cardThumb(c: SearchIndexCard): string | null {
  return c.image ? `${c.image}/low.webp` : null
}

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
  const [cardIndex, setCardIndex] = useState<SearchIndexCard[] | null>(null)

  // Kicked off on mount, not on first keystroke — it's a ~200KB gzipped
  // lazy chunk, usually already loaded by the time someone finishes typing.
  useEffect(() => {
    loadSearchIndex().then(setCardIndex)
  }, [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? SETS.filter((s) => s.name.toLowerCase().includes(q)) : SETS
    return groupBySeries(filtered)
  }, [query])

  const matchingCards = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !cardIndex) return []
    return cardIndex
      .filter((c) => c.name.toLowerCase().includes(q) || c.localId.toLowerCase().includes(q))
      .slice(0, MAX_CARD_RESULTS)
  }, [query, cardIndex])

  useDocumentMeta(null, null, '/')

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
          placeholder="Search sets or cards (name, number)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sets or cards"
        />
      </div>

      {query.trim() && matchingCards.length > 0 && (
        <section className="serie-group">
          <h4 className="serie-title">Cards</h4>
          <div className="card-grid">
            {matchingCards.map((c) => {
              const thumb = cardThumb(c)
              return (
                <a key={c.id} className="card-tile" href={`/card/${c.id}`}>
                  {thumb ? (
                    <RetryImage
                      src={thumb}
                      alt={c.name}
                      loading="lazy"
                      placeholder={<div className="card-tile-placeholder">{c.name}</div>}
                    />
                  ) : (
                    <div className="card-tile-placeholder">{c.name}</div>
                  )}
                  <div className="card-tile-body">
                    <div className="card-tile-name-block">
                      <strong>{c.name}</strong>
                      <span className="muted">
                        {c.setName} · #{c.localId}
                      </span>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
          {matchingCards.length === MAX_CARD_RESULTS && (
            <p className="muted">Showing the first {MAX_CARD_RESULTS} matches — refine your search for more specific results.</p>
          )}
        </section>
      )}

      {groups.map(([serie, sets]) => (
        <section key={serie} className="serie-group">
          <h4 className="serie-title">{serie}</h4>
          <div className="set-grid">
            {sets.map((s) => {
              const logo = setLogo(s)
              return (
                <a key={s.id} className="set-tile" href={`/set/${s.id}`}>
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
      {groups.length === 0 && matchingCards.length === 0 && <p className="muted">No set or card found.</p>}

      <p className="muted">More sets are added step by step.</p>
    </div>
  )
}
