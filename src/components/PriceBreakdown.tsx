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
  // A row is hidden only when its multiplier would read "×1" anyway. Rows are
  // otherwise always shown, even the ones that name a bucket rather than a
  // property of this card ("n/a" for a Pokémon card's cardName factor): they
  // are genuinely applied to the price, so hiding them would leave the visible
  // list multiplying out to something other than the stated total.
  const isNeutral = (mult: number) => Math.abs(mult - 1) < 0.005
  const allFactorRows = [
    {
      label: 'Pokémon',
      // The multiplier shown already includes the tier exponent, so the note
      // explains why this Pokémon's premium is bigger here than on a bulk card.
      value:
        f.pokemon.key === 'none'
          ? '— (Trainer/Energy)'
          : `${pokemonSpeciesName(f.pokemon.key)}${
              f.pokemon.tierExponent > 1.01
                ? ` — popularity counts ${multFmt.format(f.pokemon.tierExponent)}× on ${f.pokemon.tier} cards`
                : ''
            }`,
      mult: f.pokemon.displayFactor,
      hidden: false,
    },
    // Label from the factor's own key, not card.rarity: a hand-tagged promo is
    // modeled as "Promo (Alt Art 10)" and shows a factor to match, so printing
    // the raw "Promo" here would leave that multiplier unexplained.
    { label: 'Rarity', value: f.rarity.key, mult: f.rarity.displayFactor, hidden: false },
    {
      label: 'Rarity (year)',
      value: `what that rarity meant in ${f.rarityYear.key.split(' | ')[1] ?? 'Unknown'}`,
      mult: f.rarityYear.displayFactor,
      hidden: false,
    },
    { label: 'Illustrator', value: card.illustrator ?? 'Unknown', mult: f.illustrator.displayFactor, hidden: false },
    { label: 'Set', value: setName, mult: f.set.displayFactor, hidden: false },
    { label: 'Card type', value: card.cardType ?? 'Standard', mult: f.cardType.displayFactor, hidden: false },
    {
      label: 'Card type (year)',
      value: `what that type meant in ${f.cardTypeYear.key.split(' | ')[1] ?? 'Unknown'}`,
      mult: f.cardTypeYear.displayFactor,
      hidden: false,
    },
    {
      label: 'Card',
      // Only Trainer/Energy cards get a per-name factor; a Pokémon card's
      // identity is already carried by the Pokémon factor, so it lands in a
      // shared "n/a" bucket — which still has a value, so it still shows.
      value: f.cardName.key === 'n/a' ? '— (covered by Pokémon)' : card.name,
      mult: f.cardName.displayFactor,
      hidden: isNeutral(f.cardName.displayFactor),
    },
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
        Each factor below is computed from real Cardmarket prices across ~19,000 cards.{' '}
        <a href="/how-it-works">How this is calculated →</a>
      </p>
      <ul className="breakdown-list">
        <li>
          <span>Typical card</span>
          <span className="muted">what an average card is worth, before anything specific to this one</span>
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
