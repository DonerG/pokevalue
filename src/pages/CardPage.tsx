import { useEffect, useMemo, useState } from 'react'
import { FACTORS, defaultSelection, type Config, type FactorId, type Selection } from '../data/defaults'
import { fairPrice, formatEuro, score } from '../logic/pricing'
import {
  cardImage,
  cardmarketUrl,
  formatDate,
  getSet,
  loadCard,
  PRICING_META,
  type CardData,
} from '../data/cards'
import { OptionGroup } from '../components/OptionGroup'
import { ResultPanel } from '../components/ResultPanel'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { RetryImage } from '../components/RetryImage'

interface Props {
  cardId: string
  config: Config
}

function trendToInput(trend: number | null | undefined): string {
  return trend != null ? trend.toLocaleString('en-IE', { maximumFractionDigits: 2 }) : ''
}

export function CardPage({ cardId, config }: Props) {
  // undefined = still loading, null = confirmed not found
  const [card, setCard] = useState<CardData | null | undefined>(undefined)
  const [selection, setSelection] = useState<Selection>(() => defaultSelection())
  const [marketInput, setMarketInput] = useState('')

  useEffect(() => {
    setCard(undefined)
    setSelection(defaultSelection())
    loadCard(cardId).then((c) => {
      setCard(c ?? null)
      if (c) setMarketInput(trendToInput(c.market?.trend))
    })
  }, [cardId])

  const results = useMemo(() => {
    if (!card) return null
    return {
      score: score(card.baseValue, PRICING_META.minBaseValue, PRICING_META.maxBaseValue),
      base: card.baseValue,
      fair: fairPrice(card.baseValue, selection, config),
    }
  }, [card, selection, config])

  if (card === undefined) {
    return <p className="muted">Loading card…</p>
  }

  if (!card || !results) {
    return (
      <p className="muted">
        Card not found. <a href="#/">Back to overview</a>
      </p>
    )
  }

  const set = getSet(card.id.slice(0, card.id.lastIndexOf('-')))
  const img = cardImage(card, 'high')
  const handleSelect = (factorId: FactorId, optionId: string) =>
    setSelection((prev) => ({ ...prev, [factorId]: optionId }))

  return (
    <div>
      <nav className="breadcrumb">
        <a href="#/">Sets</a> /{' '}
        {set ? <a href={`#/set/${set.id}`}>{set.name}</a> : 'Set'} / <strong>{card.name}</strong>
      </nav>

      <div className="card-layout">
        <div className="card-visual">
          {img && <RetryImage src={img} alt={card.name} loading="eager" />}
          <div className="card-facts">
            <h2>{card.name}</h2>
            <p className="muted">
              #{card.localId}
              {set ? ` · ${set.name}` : ''} · {card.rarity ?? 'rarity unknown'}
            </p>
            {card.market ? (
              <p className="muted">
                Cardmarket: Trend {card.market.trend != null ? formatEuro(card.market.trend) : '–'}
                {card.market.avg30 != null && <> · 30-day avg {formatEuro(card.market.avg30)}</>}
                {card.market.updated && <> · as of {formatDate(card.market.updated)}</>}
              </p>
            ) : card.priceFlagged ? (
              <p className="muted">Cardmarket price hidden — flagged as inaccurate, excluded from the model.</p>
            ) : (
              <p className="muted">No Cardmarket price available.</p>
            )}
            <a className="cardmarket-link" href={cardmarketUrl(card)} target="_blank" rel="noreferrer">
              View on Cardmarket ↗
            </a>
          </div>
        </div>

        <div className="card-controls">
          <PriceBreakdown
            card={card}
            setName={set?.name ?? card.id}
            selection={selection}
            config={config}
            fairPrice={results.fair}
            market={card.market?.trend ?? null}
          />
        </div>

        <aside className="card-result">
          <details className="panel your-copy-details">
            <summary>
              <h2>Your Copy</h2>
              <p className="panel-intro">Condition &amp; language for your specific copy (optional)</p>
            </summary>
            {FACTORS.map((def) => (
              <OptionGroup
                key={def.id}
                def={def}
                config={config}
                value={selection[def.id]}
                onChange={(optionId) => handleSelect(def.id, optionId)}
              />
            ))}
          </details>

          <ResultPanel
            score={results.score}
            baseValue={results.base}
            fairPrice={results.fair}
            marketInput={marketInput}
            onMarketInput={setMarketInput}
            config={config}
          />
        </aside>
      </div>
    </div>
  )
}
