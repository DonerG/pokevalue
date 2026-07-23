import { FACTORS, type Config, type Selection } from '../data/defaults'
import type { CardData } from '../data/cards'
import { formatEuro } from '../logic/pricing'

const multFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })

interface Props {
  card: CardData
  setName: string
  selection: Selection
  config: Config
  fairPrice: number
}

/** Read-only "why this price" breakdown: the card's fixed, data-derived factors, then your copy's condition/language on top. */
export function PriceBreakdown({ card, setName, selection, config, fairPrice }: Props) {
  const f = card.factors
  const cardRows = [
    { label: 'Pokémon', value: f.pokemon.key === 'none' ? '— (Trainer/Energy)' : card.name, mult: f.pokemon.displayFactor },
    { label: 'Rarity', value: card.rarity ?? 'Unknown', mult: f.rarity.displayFactor },
    { label: 'Illustrator', value: card.illustrator ?? 'Unknown', mult: f.illustrator.displayFactor },
    { label: 'Set', value: setName, mult: f.set.displayFactor },
    { label: 'Card type', value: card.cardType ?? 'Standard', mult: f.cardType.displayFactor },
  ]
  const factorProduct = cardRows.reduce((acc, r) => acc * r.mult, 1)
  const anchor = factorProduct > 0 ? card.baseValue / factorProduct : card.baseValue

  const copyRows = FACTORS.map((def) => {
    const optionId = selection[def.id]
    const option = def.options.find((o) => o.id === optionId)
    const mult = config.multipliers[def.id][optionId] ?? 1
    return { label: def.label, value: option?.label ?? optionId, mult }
  })

  return (
    <details className="price-breakdown">
      <summary>Why this price?</summary>
      <ul className="breakdown-list">
        <li>
          <span>Base rate</span>
          <span className="muted">every card starts here</span>
          <span className="breakdown-mult">{formatEuro(anchor)}</span>
        </li>
        {cardRows.map((r) => (
          <li key={r.label}>
            <span>{r.label}</span>
            <span className="muted">{r.value}</span>
            <span className="breakdown-mult">×{multFmt.format(r.mult)}</span>
          </li>
        ))}
        <li className="breakdown-total">
          <span>Card base value</span>
          <span />
          <span className="breakdown-mult">{formatEuro(card.baseValue)}</span>
        </li>
      </ul>
      <ul className="breakdown-list">
        {copyRows.map((r) => (
          <li key={r.label}>
            <span>{r.label}</span>
            <span className="muted">{r.value}</span>
            <span className="breakdown-mult">×{multFmt.format(r.mult)}</span>
          </li>
        ))}
        <li className="breakdown-total">
          <span>Fair price (your copy)</span>
          <span />
          <span className="breakdown-mult">{formatEuro(fairPrice)}</span>
        </li>
      </ul>
      <p className="muted">
        Pokémon, rarity, illustrator, set, and card type come from a regression model trained on
        real Cardmarket prices across ~19,000 cards — fixed facts, not something you adjust by
        hand. Condition and language are reasonable assumptions layered on top, since Cardmarket's
        data doesn't separate those out.
      </p>
    </details>
  )
}
