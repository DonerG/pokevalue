import { formatDate, SETS, setLogo } from '../data/cards'

export function HomePage() {
  return (
    <div className="home">
      <section className="hero-block">
        <h2>Was ist eine Pokémon-Karte wirklich wert?</h2>
        <p>
          PokéPreis berechnet für jede Karte einen fairen Preis nach einer transparenten Formel —
          Seltenheit, Alter, Beliebtheit und Angebot sind pro Karte schon vorbelegt. Vergleiche das
          Ergebnis mit dem aktuellen Cardmarket-Preis und sieh sofort, ob eine Karte über- oder
          unterbewertet ist. Für dein konkretes Exemplar stellst du nur noch Zustand, Sprache und
          Auflage ein.
        </p>
      </section>

      <h3 className="section-title">Sets im System</h3>
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
                  {formatDate(s.releaseDate)} · {s.cardCount} Karten
                </span>
              </div>
            </a>
          )
        })}
      </div>
      <p className="muted">
        Weitere Sets folgen Schritt für Schritt. Bis dahin kannst du jede beliebige Karte mit dem{' '}
        <a href="#/rechner">freien Rechner</a> bewerten.
      </p>
    </div>
  )
}
