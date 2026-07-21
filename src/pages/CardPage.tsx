import { useMemo, useState } from 'react'
import { CARD_FACTORS, EXEMPLAR_FACTORS, type Config, type FactorId } from '../data/defaults'
import { baseValue, fairPrice, formatEuro, score } from '../logic/pricing'
import { cardImage, cardmarketUrl, formatDate, getCard, getSet, selectionForCard } from '../data/cards'
import { OptionGroup } from '../components/OptionGroup'
import { ResultPanel } from '../components/ResultPanel'

interface Props {
  cardId: string
  config: Config
}

function trendToInput(trend: number | null | undefined): string {
  return trend != null ? trend.toLocaleString('en-IE', { maximumFractionDigits: 2 }) : ''
}

export function CardPage({ cardId, config }: Props) {
  const card = getCard(cardId)
  const [selection, setSelection] = useState(() => (card ? selectionForCard(card) : null))
  const [marketInput, setMarketInput] = useState(() => trendToInput(card?.market?.trend))

  const results = useMemo(() => {
    if (!selection) return null
    return {
      score: score(selection, config),
      base: baseValue(selection, config),
      fair: fairPrice(selection, config),
    }
  }, [selection, config])

  if (!card || !selection || !results) {
    return (
      <p className="muted">
        Card not found. <a href="#/">Back to overview</a>
      </p>
    )
  }

  const set = getSet(card.id.slice(0, card.id.lastIndexOf('-')))
  const img = cardImage(card, 'high')
  const handleSelect = (factorId: FactorId, optionId: string) =>
    setSelection((prev) => (prev ? { ...prev, [factorId]: optionId } : prev))

  return (
    <div>
      <nav className="breadcrumb">
        <a href="#/">Sets</a> /{' '}
        {set ? <a href={`#/set/${set.id}`}>{set.name}</a> : 'Set'} / <strong>{card.name}</strong>
      </nav>

      <div className="card-layout">
        <div className="card-visual">
          {img && <img src={img} alt={card.name} />}
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
            ) : (
              <p className="muted">No Cardmarket price available.</p>
            )}
            {set && (
              <a className="cardmarket-link" href={cardmarketUrl(card, set)} target="_blank" rel="noreferrer">
                View on Cardmarket ↗
              </a>
            )}
          </div>
        </div>

        <div className="card-controls">
          <section className="panel">
            <h2>Your Copy</h2>
            <p className="panel-intro">
              Condition, language, and edition determine the concrete price of this copy.
            </p>
            {EXEMPLAR_FACTORS.map((def) => (
              <OptionGroup
                key={def.id}
                def={def}
                config={config}
                value={selection[def.id]}
                onChange={(optionId) => handleSelect(def.id, optionId)}
              />
            ))}
          </section>

          <details className="panel">
            <summary>
              <h2>Card Factors (preset)</h2>
              <p className="panel-intro">
                Rarity, era, popularity, and supply are preset from the card data — you can
                override them here for this valuation.
              </p>
            </summary>
            {CARD_FACTORS.map((def) => (
              <OptionGroup
                key={def.id}
                def={def}
                config={config}
                value={selection[def.id]}
                onChange={(optionId) => handleSelect(def.id, optionId)}
              />
            ))}
          </details>
        </div>

        <aside className="card-result">
          <ResultPanel
            score={results.score}
            baseValue={results.base}
            fairPrice={results.fair}
            marketInput={marketInput}
            onMarketInput={setMarketInput}
            config={config}
            selection={selection}
          />
        </aside>
      </div>
    </div>
  )
}
