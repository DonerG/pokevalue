import { CARD_FACTORS, EXEMPLAR_FACTORS, type Config, type Selection } from '../data/defaults'

const multFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })

interface Props {
  selection: Selection
  config: Config
  /** Whether the copy-specific factors (condition/language/edition) are active. */
  showCopyFactors: boolean
}

/** Read-only "why this price" breakdown — replaces the old editable expert mode. */
export function PriceBreakdown({ selection, config, showCopyFactors }: Props) {
  const rows = (defs: typeof CARD_FACTORS) =>
    defs.map((def) => {
      const optionId = selection[def.id]
      const option = def.options.find((o) => o.id === optionId)
      const mult = config.multipliers[def.id][optionId] ?? 1
      return { label: def.label, optionLabel: option?.label ?? optionId, mult }
    })

  const cardRows = rows(CARD_FACTORS)
  const cardProduct = cardRows.reduce((acc, r) => acc * r.mult, 1)
  const copyRows = showCopyFactors ? rows(EXEMPLAR_FACTORS) : []

  return (
    <details className="price-breakdown">
      <summary>Why this price?</summary>
      <ul className="breakdown-list">
        {cardRows.map((r) => (
          <li key={r.label}>
            <span>{r.label}</span>
            <span className="muted">{r.optionLabel}</span>
            <span className="breakdown-mult">×{multFmt.format(r.mult)}</span>
          </li>
        ))}
        <li className="breakdown-total">
          <span>Combined card factor</span>
          <span />
          <span className="breakdown-mult">×{multFmt.format(cardProduct)}</span>
        </li>
      </ul>
      {showCopyFactors && (
        <ul className="breakdown-list">
          {copyRows.map((r) => (
            <li key={r.label}>
              <span>{r.label}</span>
              <span className="muted">{r.optionLabel}</span>
              <span className="breakdown-mult">×{multFmt.format(r.mult)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        Multipliers come from our pricing model, trained on real Cardmarket data — not something you
        adjust by hand.
      </p>
    </details>
  )
}
