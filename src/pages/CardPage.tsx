import { lazy, Suspense, useEffect, useState } from 'react'
import type { Config } from '../data/defaults'
import { formatEuro } from '../logic/pricing'
import {
  cardImage,
  cardmarketUrl,
  formatDate,
  getSet,
  loadCard,
  type CardData,
} from '../data/cards'
import { ResultPanel } from '../components/ResultPanel'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { RetryImage } from '../components/RetryImage'
import { CollectionControls } from '../components/CollectionControls'
import { useDocumentMeta } from '../logic/documentMeta'
import { cardMeta } from '../logic/pageMeta.js'
import { useAdminUnlocked } from '../logic/adminGate'
import { loadPriceWarnings, warningText, type PriceWarnings } from '../logic/priceWarnings'
import committedWarningsJson from '../data/price-warnings.json'

const COMMITTED_WARNINGS = committedWarningsJson as PriceWarnings

// The admin editor only ships to whoever unlocks the admin area.
const AdminCardControls = lazy(() =>
  import('../components/AdminCardControls').then((m) => ({ default: m.AdminCardControls })),
)

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
  const admin = useAdminUnlocked()
  // Bumped when the admin edits a warning, so the public note below re-reads it.
  const [warnTick, setWarnTick] = useState(0)

  useEffect(() => {
    setCard(undefined)
    loadCard(cardId).then((c) => {
      setCard(c ?? null)
      if (c) setMarketInput(trendToInput(c.market?.trend))
    })
  }, [cardId])

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

  if (!card) {
    return (
      <p className="muted">
        Card not found. <a href="/">Back to overview</a>
      </p>
    )
  }

  const set = getSet(card.id.slice(0, card.id.lastIndexOf('-')))
  const img = cardImage(card, 'high')
  // Public caveat. Committed warnings show to everyone; while the admin area is
  // unlocked, an uncommitted (localStorage) warning is previewed on top.
  void warnTick
  const warning = (admin ? loadPriceWarnings()[card.id] : undefined) ?? COMMITTED_WARNINGS[card.id]
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
            <h1>{card.name}</h1>
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
            <CollectionControls cardId={card.id} />
          </div>
        </div>

        <div className="card-controls">
          {warning && (
            <div className="price-warning" role="note">
              <strong>⚠ Price caveat</strong>
              <span>{warningText(warning)}</span>
            </div>
          )}
          <PriceBreakdown
            card={card}
            setName={set?.name ?? card.id}
            config={config}
            market={card.market?.trend ?? null}
          />
          {admin && (
            <Suspense fallback={<p className="muted">Loading editor…</p>}>
              <AdminCardControls card={card} onChange={() => setWarnTick((n) => n + 1)} />
            </Suspense>
          )}
        </div>

        <aside className="card-result">
          <ResultPanel
            fair={card.baseValue}
            marketInput={marketInput}
            onMarketInput={setMarketInput}
            config={config}
          />
        </aside>
      </div>
    </div>
  )
}
