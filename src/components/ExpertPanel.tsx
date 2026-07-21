import { FACTORS, type Config, type FactorId } from '../data/defaults'

interface Props {
  config: Config
  onChangeMultiplier: (factorId: FactorId, optionId: string, value: number) => void
  onChangeAnchor: (value: number) => void
  onChangeThreshold: (key: 'over' | 'under', value: number) => void
  onReset: () => void
}

export function ExpertPanel({
  config,
  onChangeMultiplier,
  onChangeAnchor,
  onChangeThreshold,
  onReset,
}: Props) {
  return (
    <details className="panel expert-panel">
      <summary>
        <h2>Expert Mode: Adjust the Formula</h2>
        <p className="panel-intro">
          Every multiplier, the anchor, and the valuation thresholds are just suggestions — set
          them however you see fit. Changes are saved in your browser.
        </p>
      </summary>

      <div className="expert-grid">
        <label className="expert-field">
          <span>Anchor (€) — value of an ordinary modern holo card</span>
          <input
            type="number"
            min="0.01"
            step="0.1"
            value={config.anchor}
            onChange={(e) => onChangeAnchor(parseFloat(e.target.value))}
          />
        </label>
        <label className="expert-field">
          <span>"Overvalued" threshold (% above fair price)</span>
          <input
            type="number"
            min="0"
            step="5"
            value={config.thresholds.over}
            onChange={(e) => onChangeThreshold('over', parseFloat(e.target.value))}
          />
        </label>
        <label className="expert-field">
          <span>"Undervalued" threshold (% below fair price)</span>
          <input
            type="number"
            min="0"
            step="5"
            value={config.thresholds.under}
            onChange={(e) => onChangeThreshold('under', parseFloat(e.target.value))}
          />
        </label>
      </div>

      {FACTORS.map((f) => (
        <div key={f.id} className="expert-factor">
          <h3>
            {f.label} <span className="stage-tag">{f.stage === 'card' ? 'Card' : 'Copy'}</span>
          </h3>
          <div className="expert-grid">
            {f.options.map((o) => (
              <label key={o.id} className="expert-field">
                <span>{o.label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={config.multipliers[f.id][o.id]}
                  onChange={(e) => onChangeMultiplier(f.id, o.id, parseFloat(e.target.value))}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <button type="button" className="reset-button" onClick={onReset}>
        Reset to defaults
      </button>
    </details>
  )
}
