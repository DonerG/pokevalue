import type { Config } from '../data/defaults'
import {
  formatEuro,
  formatPercent,
  parseNumber,
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
  undervalued: {
    icon: '▲',
    label: 'Undervalued',
    hint: 'The market price is well below the fair price — a good buy per the formula.',
  },
  fair: {
    icon: '✓',
    label: 'Fairly valued',
    hint: 'The market price is close to the formula’s fair price.',
  },
  overvalued: {
    icon: '▼',
    label: 'Overvalued',
    hint: 'The market price is well above the fair price — too expensive per the formula.',
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
  const market = parseNumber(marketInput)
  const v = marketInput.trim() === '' ? null : verdict(market, referencePrice, config)
  const scoreRounded = Math.round(score)

  return (
    <section className="panel result-panel">
      <h2>Valuation</h2>

      <div className="score-block">
        <div className="score-head">
          <span className="score-title">Card Score</span>
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
          aria-label="Card Score"
        >
          <div className="score-fill" style={{ width: `${score}%` }} />
        </div>
        <p className="muted">
          The card's position between the weakest and strongest possible combination —
          independent of the copy's condition.
        </p>
      </div>

      <dl className="price-list">
        <div className="price-row">
          <dt>Card base value</dt>
          <dd>{formatEuro(baseValue)}</dd>
        </div>
        {fairPrice !== null && (
          <div className="price-row price-row-main">
            <dt>Fair price (your copy)</dt>
            <dd>{formatEuro(fairPrice)}</dd>
          </div>
        )}
      </dl>
      {fairPrice === null && (
        <p className="muted">
          Enable "Specific Copy" to get a concrete price for condition, language, and edition.
          Otherwise the market comparison uses the base value.
        </p>
      )}

      <div className="market-block">
        <label htmlFor="market-price">Current market price (e.g. Cardmarket)</label>
        <div className="market-input">
          <input
            id="market-price"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 24.99"
            value={marketInput}
            onChange={(e) => onMarketInput(e.target.value)}
          />
          <span className="unit">€</span>
        </div>

        {marketInput.trim() !== '' && v === null && (
          <p className="muted">Please enter a valid price.</p>
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
