import type { Config } from '../data/defaults'
import { formatPercent, parseNumber, verdict, type Verdict } from '../logic/pricing'

interface Props {
  /** The card's fair price — what an entered price is judged against. */
  fair: number
  marketInput: string
  onMarketInput: (value: string) => void
  config: Config
}

const VERDICT_TEXT: Record<Verdict['kind'], { icon: string; label: string; hint: string }> = {
  undervalued: {
    icon: '▲',
    label: 'Undervalued',
    hint: 'The market price is well below the fair price — a good buy per the model.',
  },
  fair: {
    icon: '✓',
    label: 'Fairly valued',
    hint: 'The market price is close to the model’s fair price.',
  },
  overvalued: {
    icon: '▼',
    label: 'Overvalued',
    hint: 'The market price is well above the fair price — too expensive per the model.',
  },
}

export function ResultPanel({ fair, marketInput, onMarketInput, config }: Props) {
  const market = parseNumber(marketInput)
  const v = marketInput.trim() === '' ? null : verdict(market, fair, config)

  return (
    <section className="panel result-panel">
      <h2>Check a price</h2>
      <p className="panel-intro">
        Prefilled with the current Cardmarket price. Change it to whatever you're being asked or
        offered, and see how that compares with the fair price.
      </p>

      <div className="market-block">
        <label htmlFor="market-price">Price to check</label>
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
