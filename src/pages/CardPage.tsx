import { useEffect, useMemo, useState } from 'react'
import type { Config } from '../data/defaults'
import { formatEuro, score } from '../logic/pricing'
import {
  cardImage,
  cardmarketUrl,
  formatDate,
  getSet,
  loadCard,
  PRICING_META,
  type CardData,
} from '../data/cards'
import { ResultPanel } from '../components/ResultPanel'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { RetryImage } from '../components/RetryImage'
import { useDocumentMeta } from '../logic/documentMeta'
import { cardMeta } from '../logic/pageMeta.js'

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
  const [marketInput, setMarketInput] = useState('')

  useEffect(() => {
    setCard(undefined)
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
    }
  }, [card])

  // Computed before the early returns below so the hook call stays
  // unconditional — `set` is derived again after them for rendering.
  const metaSet = card ? getSet(card.id.slice(0, card.id.lastIndexOf('-'))) : undefined
  const meta = cardMeta(card, metaSet)
  useDocumentMeta(
    meta.title,
    meta.description,
    `/card/${cardId}`,
    card ? cardImage(card, 'high') : null,
  )

  if (card === undefined) {
    return <p className="muted">Loading card…</p>
  }

  if (!card || !results) {
    return (
      <p className="muted">
        Card not found. <a href="/">Back to overview</a>
      </p>
    )
  }

  const set = getSet(card.id.slice(0, card.id.lastIndexOf('-')))
  const img = cardImage(card, 'high')
  return (
    <div>
      <nav className="breadcrumb">
        <a href="/">Sets</a> /{' '}
        {set ? <a href={`/set/${set.id}`}>{set.name}</a> : 'Set'} / <strong>{card.name}</strong>
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
                {/* A corrected price is hand-read off Cardmarket, so it isn't
                    attributed to the automatic feed — and it carries a trend
                    price only, which is why no 30-day average appears here. */}
                {card.priceCorrected ? 'Trend price (corrected by hand): ' : 'Cardmarket: Trend '}
                {card.market.trend != null ? formatEuro(card.market.trend) : '–'}
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
            config={config}
            market={card.market?.trend ?? null}
          />
        </div>

        <aside className="card-result">
          <ResultPanel
            score={results.score}
            baseValue={results.base}
            marketInput={marketInput}
            onMarketInput={setMarketInput}
            config={config}
          />
        </aside>
      </div>
    </div>
  )
}
