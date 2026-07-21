import type { Config } from '../data/defaults'
import {
  formatEuro,
  formatPercent,
  parseGermanNumber,
  verdict,
  type Verdict,
} from '../logic/pricing'

interface Props {
  score: number
  baseValue: number
  fairPrice: number | null
  marketInput: string
  onMarketInput: (value: string) => void
  config: Config
}

const VERDICT_TEXT: Record<Verdict['kind'], { icon: string; label: string; hint: string }> = {
  unterbewertet: {
    icon: '▼',
    label: 'Unterbewertet',
    hint: 'Der Marktpreis liegt deutlich unter dem fairen Preis — laut Formel ein guter Kauf.',
  },
  fair: {
    icon: '✓',
    label: 'Fair bewertet',
    hint: 'Der Marktpreis liegt nahe am fairen Preis der Formel.',
  },
  ueberbewertet: {
    icon: '▲',
    label: 'Überbewertet',
    hint: 'Der Marktpreis liegt deutlich über dem fairen Preis — laut Formel zu teuer.',
  },
}

export function ResultPanel({
  score,
  baseValue,
  fairPrice,
  marketInput,
  onMarketInput,
  config,
}: Props) {
  const referencePrice = fairPrice ?? baseValue
  const market = parseGermanNumber(marketInput)
  const v = marketInput.trim() === '' ? null : verdict(market, referencePrice, config)
  const scoreRounded = Math.round(score)

  return (
    <section className="panel result-panel">
      <h2>Bewertung</h2>

      <div className="score-block">
        <div className="score-head">
          <span className="score-title">Karten-Score</span>
          <span className="score-value">
            {scoreRounded}
            <span className="score-max">/100</span>
          </span>
        </div>
        <div
          className="score-meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={scoreRounded}
          aria-label="Karten-Score"
        >
          <div className="score-fill" style={{ width: `${score}%` }} />
        </div>
        <p className="muted">
          Lage der Karte zwischen der schwächsten und stärksten möglichen Kombination — unabhängig
          vom Zustand des Exemplars.
        </p>
      </div>

      <dl className="price-list">
        <div className="price-row">
          <dt>Basiswert der Karte</dt>
          <dd>{formatEuro(baseValue)}</dd>
        </div>
        {fairPrice !== null && (
          <div className="price-row price-row-main">
            <dt>Fairer Preis (dein Exemplar)</dt>
            <dd>{formatEuro(fairPrice)}</dd>
          </div>
        )}
      </dl>
      {fairPrice === null && (
        <p className="muted">
          Aktiviere „Konkretes Exemplar“, um einen konkreten Preis für Zustand, Sprache und Auflage
          zu erhalten. Der Marktvergleich nutzt sonst den Basiswert.
        </p>
      )}

      <div className="market-block">
        <label htmlFor="market-price">Aktueller Marktpreis (z.&nbsp;B. Cardmarket)</label>
        <div className="market-input">
          <input
            id="market-price"
            type="text"
            inputMode="decimal"
            placeholder="z. B. 24,99"
            value={marketInput}
            onChange={(e) => onMarketInput(e.target.value)}
          />
          <span className="unit">€</span>
        </div>

        {marketInput.trim() !== '' && v === null && (
          <p className="muted">Bitte einen gültigen Preis eingeben.</p>
        )}
        {v && (
          <div className={`verdict verdict-${v.kind}`}>
            <span className="verdict-icon" aria-hidden="true">
              {VERDICT_TEXT[v.kind].icon}
            </span>
            <div>
              <strong>
                {VERDICT_TEXT[v.kind].label} ({formatPercent(v.deviation)})
              </strong>
              <p>{VERDICT_TEXT[v.kind].hint}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
