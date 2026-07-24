import { FACTORS, type Config, type Selection } from '../data/defaults'
import { pokemonSpeciesName, type CardData } from '../data/cards'
import { formatEuro } from '../logic/pricing'
import { VerdictChip } from './VerdictChip'

const multFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })

interface Props {
  card: CardData
  setName: string
  selection: Selection
  config: Config
  fairPrice: number
  market: number | null
}

/** Read-only "why this price" breakdown: the card's fixed, data-derived factors, then your copy's condition/language on top. */
export function PriceBreakdown({ card, setName, selection, config, fairPrice, market }: Props) {
  const f = card.factors
  // "Card" (cardName factor) only applies to Trainer/Energy cards — Pokémon
  // cards get "n/a" there since "pokemon" already carries their identity.
  // Always folded into factorProduct (so the derived anchor stays exact),
  // but only shown as its own row when it's not the neutral n/a bucket.
  const allFactorRows = [
    {
      label: 'Pokémon',
      value: f.pokemon.key === 'none' ? '— (Trainer/Energy)' : pokemonSpeciesName(f.pokemon.key),
      mult: f.pokemon.displayFactor,
      hidden: false,
    },
    { label: 'Rarity', value: card.rarity ?? 'Unknown', mult: f.rarity.displayFactor, hidden: false },
    { label: 'Illustrator', value: card.illustrator ?? 'Unknown', mult: f.illustrator.displayFactor, hidden: false },
    { label: 'Set', value: setName, mult: f.set.displayFactor, hidden: false },
    { label: 'Card type', value: card.cardType ?? 'Standard', mult: f.cardType.displayFactor, hidden: false },
    { label: 'Card', value: card.name, mult: f.cardName.displayFactor, hidden: f.cardName.key === 'n/a' },
  ]
  const factorProduct = allFactorRows.reduce((acc, r) => acc * r.mult, 1)
  const anchor = factorProduct > 0 ? card.baseValue / factorProduct : card.baseValue
  const cardRows = allFactorRows.filter((r) => !r.hidden)

  const copyRows = FACTORS.map((def) => {
    const optionId = selection[def.id]
    const option = def.options.find((o) => o.id === optionId)
    const mult = config.multipliers[def.id][optionId] ?? 1
    return { label: def.label, value: option?.label ?? optionId, mult }
  })

  return (
    <section className="panel price-breakdown-panel">
      <h2>Why this price?</h2>
      <div className="price-compare">
        <div className="price-compare-item">
          <span className="muted">Market price</span>
          <strong>{market != null ? formatEuro(market) : '–'}</strong>
        </div>
        <div className="price-compare-item">
          <span className="muted">Fair price</span>
          <strong>{formatEuro(card.baseValue)}</strong>
        </div>
        <VerdictChip market={market} fair={card.baseValue} config={config} />
      </div>
      <p className="panel-intro">
        Pokémon, rarity, illustrator, set, and card type come from a regression model trained on
        real Cardmarket prices across ~19,000 cards — fixed facts, not something you adjust by
        hand. Condition and language (below) are reasonable assumptions layered on top, since
        Cardmarket's data doesn't separate those out.
      </p>
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
    </section>
  )
}
