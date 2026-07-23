import { formatDate, SETS, setLogo } from '../data/cards'

export function HomePage() {
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

      <h3 className="section-title">Sets in the system</h3>
      <div className="set-grid">
        {SETS.map((s) => {
          const logo = setLogo(s)
          return (
            <a key={s.id} className="set-tile" href={`#/set/${s.id}`}>
              {logo ? (
                <img src={logo} alt="" loading="lazy" />
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
      <p className="muted">More sets are added step by step.</p>
    </div>
  )
}
