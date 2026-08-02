import type { Config } from '../data/defaults'
import { pokemonSpeciesName, type Breakdown, type CardData } from '../data/cards'
import { formatEuro, verdict, viewsSentence } from '../logic/pricing'
import { VerdictChip } from './VerdictChip'

const multFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })

interface Props {
  card: CardData
  setName: string
  config: Config
  market: number | null
}

const VIEWS = [
  { key: 'broad', label: 'Wide view', hint: 'vs. the broad average for a card like this' },
  { key: 'standard', label: 'Standard view', hint: 'vs. similar cards from this era' },
  { key: 'local', label: 'Close-up view', hint: 'vs. the same rarity in this set' },
] as const

// Order the factor rows are shown in within an expanded view.
const FACTOR_ORDER = [
  'pokemon',
  'rarity',
  'rarityYear',
  'illustrator',
  'set',
  'raritySet',
  'cardType',
  'cardTypeYear',
  'artwork',
  'cardName',
] as const

const isNeutral = (mult: number) => Math.abs(mult - 1) < 0.005

/** The visible factor rows for one view, in reading order — only the categories that view actually uses are present. */
function factorRows(bd: Breakdown, card: CardData, setName: string) {
  const rows: { label: string; value: string; mult: number }[] = []
  for (const cat of FACTOR_ORDER) {
    const e = bd[cat]
    if (!e) continue
    let label: string
    let value: string
    let hideIfNeutral = false
    switch (cat) {
      case 'pokemon':
        label = 'Pokémon'
        value =
          e.key === 'none'
            ? '— (Trainer/Energy)'
            : `${pokemonSpeciesName(e.key)}${
                e.tierExponent && e.tierExponent > 1.01
                  ? ` — popularity counts ${multFmt.format(e.tierExponent)}× on ${e.tier} cards`
                  : ''
              }`
        break
      case 'rarity':
        label = 'Rarity'
        value = e.key
        break
      case 'rarityYear':
        label = 'Rarity (year)'
        value = `what that rarity meant in ${e.key.split(' | ')[1] ?? 'Unknown'}`
        break
      case 'illustrator':
        label = 'Illustrator'
        value = card.illustrator ?? 'Unknown'
        break
      case 'set':
        label = 'Set'
        value = setName
        break
      case 'raritySet':
        label = 'Rarity in this set'
        value = `this rarity inside ${setName}`
        break
      case 'cardType':
        label = 'Card type'
        value = card.cardType ?? 'Standard'
        break
      case 'cardTypeYear':
        label = 'Card type (year)'
        value = `what that type meant in ${e.key.split(' | ')[1] ?? 'Unknown'}`
        break
      case 'artwork':
        label = 'Artwork'
        value =
          e.key === 'top'
            ? 'outstanding illustration'
            : e.key === 'strong'
              ? 'strong illustration'
              : e.key === 'weak'
                ? 'weak illustration for its tier'
                : '— (not rated)'
        hideIfNeutral = true
        break
      case 'cardName':
        label = 'Card'
        value = e.key === 'n/a' ? '— (covered by Pokémon)' : card.name
        hideIfNeutral = true
        break
      default:
        continue
    }
    if (hideIfNeutral && isNeutral(e.displayFactor)) continue
    rows.push({ label, value, mult: e.displayFactor })
  }
  return rows
}

/** The expandable body of one view: its anchor, its factors, its own total. */
function ViewFactors({ view, card, setName }: { view: (typeof VIEWS)[number]; card: CardData; setName: string }) {
  const fair = card.fairs[view.key]
  const rows = factorRows(card.breakdowns[view.key], card, setName)
  const product = rows.reduce((acc, r) => acc * r.mult, 1)
  const anchor = product > 0 ? fair / product : fair
  return (
    <ul className="breakdown-list">
      <li>
        <span>Typical card</span>
        <span className="muted">an average card, before anything specific to this one</span>
        <span className="breakdown-mult">{formatEuro(anchor)}</span>
      </li>
      {rows.map((r) => (
        <li key={r.label}>
          <span>{r.label}</span>
          <span className="muted">{r.value}</span>
          <span className="breakdown-mult">×{multFmt.format(r.mult)}</span>
        </li>
      ))}
      <li className="breakdown-total">
        <span>{view.label} fair price</span>
        <span className="muted">the factors above multiplied together</span>
        <span className="breakdown-mult">{formatEuro(fair)}</span>
      </li>
    </ul>
  )
}

export function PriceBreakdown({ card, setName, config, market }: Props) {
  const viewVerdicts =
    market != null ? VIEWS.map((v) => verdict(market, card.fairs[v.key], config)?.kind ?? null) : []
  const allAgree = viewVerdicts.length > 0 && viewVerdicts.every((k) => k != null && k === viewVerdicts[0])

  const headline = market != null ? verdict(market, card.baseValue, config) : null
  // deviation is the move to reach fair, relative to the current market price:
  // positive = upside (room to rise), negative = downside (room to fall).
  const potential = headline ? Math.round(Math.abs(headline.deviation) * 100) : 0
  const line =
    headline == null
      ? 'No market price to compare against.'
      : headline.kind === 'undervalued'
        ? `Upside potential: +${potential}% — room to rise to the fair price.`
        : headline.kind === 'overvalued'
          ? `Downside potential: −${potential}% — room to fall to the fair price.`
          : 'The market price sits within the fair range for this card.'

  return (
    <section className="panel price-breakdown-panel">
      <h2>Why this price?</h2>

      {/* The headline: what the two numbers mean, made unmissable. */}
      <div className={`price-verdict verdict-${headline?.kind ?? 'none'}`}>
        <div className="price-verdict-nums">
          <div>
            <span className="muted">Market price</span>
            <strong>{market != null ? formatEuro(market) : '–'}</strong>
          </div>
          <span className="price-verdict-vs">vs</span>
          <div>
            <span className="muted">Fair price</span>
            <strong>{formatEuro(card.baseValue)}</strong>
          </div>
        </div>
        <p className="price-verdict-line">{line}</p>
      </div>

      {/* The three views. Each is collapsed; open one to see the factors that
          view uses (broad the fewest, local the most), each multiplying out to
          its own fair price. The fair price above is the middle of the three. */}
      <h3 className="views-heading">Three ways to compare — open one for its factors</h3>
      <div className="views-list">
        {VIEWS.map((v) => (
          <details key={v.key} className="view-details">
            <summary>
              <span className="views-label">
                {v.label}
                <span className="muted"> — {v.hint}</span>
              </span>
              <span className="views-fair">{formatEuro(card.fairs[v.key])}</span>
              <VerdictChip market={market} fair={card.fairs[v.key]} config={config} />
            </summary>
            <ViewFactors view={v} card={card} setName={setName} />
          </details>
        ))}
      </div>

      {market != null && (
        <p className={allAgree ? 'views-summary views-agree' : 'views-summary views-disagree'}>
          {allAgree ? '✓ ' : '◐ '}
          {viewsSentence({ broad: viewVerdicts[0], standard: viewVerdicts[1], local: viewVerdicts[2] })}
        </p>
      )}

      <p className="panel-intro">
        Every factor is computed from real Cardmarket prices across ~19,000 cards.{' '}
        <a href="/how-it-works">How this is calculated →</a>
      </p>
    </section>
  )
}
