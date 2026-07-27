import type { Config } from '../data/defaults'
import { pokemonSpeciesName, type CardData } from '../data/cards'
import { formatEuro, verdict } from '../logic/pricing'
import { VerdictChip } from './VerdictChip'

const multFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })

interface Props {
  card: CardData
  setName: string
  config: Config
  market: number | null
}

/** The three model variants in zoom order — see /how-it-works for why three exist. */
const VIEWS: { key: 'broad' | 'standard' | 'local'; label: string; hint: string }[] = [
  { key: 'broad', label: 'Wide view', hint: 'vs. broadly similar cards across every set' },
  { key: 'standard', label: 'Standard view', hint: 'adds release-year and artwork context' },
  { key: 'local', label: 'Close-up view', hint: 'vs. the same rarity in this same set' },
]

/** Read-only "why this price" breakdown: the card's fixed, data-derived factors, then your copy's condition/language on top. */
export function PriceBreakdown({ card, setName, config, market }: Props) {
  const f = card.factors

  // Do the three views agree on the verdict? Drives the consensus line below.
  const viewVerdicts =
    market != null ? VIEWS.map((v) => verdict(market, card.fairs[v.key], config)?.kind ?? null) : []
  const allAgree = viewVerdicts.length > 0 && viewVerdicts.every((k) => k != null && k === viewVerdicts[0])
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
      label: 'Artwork',
      // Only the chase rarities get rated, and only 10/9/worse are modeled —
      // everything else lands on 'none' at ×1 and is hidden by isNeutral.
      value:
        f.artwork.key === 'top'
          ? 'outstanding illustration'
          : f.artwork.key === 'strong'
            ? 'strong illustration'
            : f.artwork.key === 'weak'
              ? 'weak illustration for its tier'
              : '— (not rated)',
      mult: f.artwork.displayFactor,
      hidden: isNeutral(f.artwork.displayFactor),
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
  // The factor list documents the STANDARD view, so it must multiply out to
  // that view's price — not to baseValue, which is the median of all three.
  const factorProduct = allFactorRows.reduce((acc, r) => acc * r.mult, 1)
  const anchor = factorProduct > 0 ? card.fairs.standard / factorProduct : card.fairs.standard
  const cardRows = allFactorRows.filter((r) => !r.hidden)

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
        <VerdictChip market={market} fair={card.baseValue} config={config} fairs={card.fairs} />
      </div>

      {/* The three comparison circles behind the fair price. The number shown
          above is their MEDIAN; the real information for anyone digging in is
          how much they agree — see /how-it-works. */}
      <ul className="views-list">
        {VIEWS.map((v) => (
          <li key={v.key}>
            <span className="views-label">
              {v.label}
              <span className="muted"> — {v.hint}</span>
            </span>
            <span className="views-fair">{formatEuro(card.fairs[v.key])}</span>
            <VerdictChip market={market} fair={card.fairs[v.key]} config={config} />
          </li>
        ))}
        <li className="views-summary">
          {market == null ? (
            <span className="muted">No market price to compare the three views against.</span>
          ) : allAgree ? (
            <span className="views-agree">✓ All three views agree — a solid verdict.</span>
          ) : (
            <span className="views-disagree">
              ◐ The views disagree — this card sits on a boundary, and the verdict depends on how you
              compare. The fair price shown is the middle of the three.
            </span>
          )}
        </li>
      </ul>
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
          <span>Standard view</span>
          <span className="muted">the factors above multiplied together</span>
          <span className="breakdown-mult">{formatEuro(card.fairs.standard)}</span>
        </li>
      </ul>
      <ul className="breakdown-list">
        <li className="breakdown-total">
          <span>Fair price</span>
          <span className="muted">the middle of the three views above</span>
          <span className="breakdown-mult">{formatEuro(card.baseValue)}</span>
        </li>
      </ul>
    </section>
  )
}
