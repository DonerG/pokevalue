import { useState } from 'react'
import type { CardData } from '../data/cards'
import { formatEuro } from '../logic/pricing'
import { loadRatings, saveRatings } from '../logic/artworkRatings'
import { loadTeraTags, saveTeraTags } from '../logic/teraTags'
import { loadPriceExclusions, savePriceExclusions } from '../logic/priceExclusions'
import { reviewKind } from '../logic/priceReview.js'
import { loadPriceWarnings, savePriceWarnings, WARNING_PRESETS, type WarningKind } from '../logic/priceWarnings'

const ARTWORK_SCALE: { label: string; value: number }[] = [
  { label: '10', value: 10 },
  { label: '9', value: 9 },
  { label: '8', value: 8 },
  { label: 'worse', value: 0 },
]

interface Props {
  card: CardData
  /** Called after any edit so the page can re-read the (localStorage) warning for live preview. */
  onChange?: () => void
}

/**
 * The admin-only editing panel shown on a card page when the admin area is
 * unlocked. Writes straight to the same localStorage stores the standalone
 * admin pages use (artwork ratings, price exclusions, price warnings), so
 * "Export all" on the hub picks everything up. Note: it captures edits for the
 * next rebuild — it does NOT re-price live, because the three fair values are
 * baked by the Python model, not computed in the browser.
 */
export function AdminCardControls({ card, onChange }: Props) {
  const [, force] = useState(0)
  const bump = () => {
    force((n) => n + 1)
    onChange?.()
  }

  const artwork = loadRatings()[card.id]
  const exclusions = loadPriceExclusions()
  const review = exclusions[card.id]
  const kind = reviewKind(review)
  const warnings = loadPriceWarnings()
  const warning = warnings[card.id]
  const isTera = !!loadTeraTags()[card.id]
  // Tera is an ex-only treatment; the toggle only makes sense on an ex card.
  const isEx = card.cardType != null && /ex/i.test(card.cardType)

  const [priceInput, setPriceInput] = useState(
    card.market?.trend != null ? String(card.market.trend) : '',
  )
  const [note, setNote] = useState(warning?.note ?? '')

  const setArtwork = (value: number) => {
    saveRatings({ ...loadRatings(), [card.id]: value })
    bump()
  }
  const clearArtwork = () => {
    const next = { ...loadRatings() }
    delete next[card.id]
    saveRatings(next)
    bump()
  }

  const saveReview = (r: 'wrong' | 'verified' | { corrected: number } | null) => {
    const next = { ...loadPriceExclusions() }
    if (r == null) delete next[card.id]
    else next[card.id] = r
    savePriceExclusions(next)
    bump()
  }
  const saveCorrectedPrice = () => {
    const n = Number(priceInput.replace(',', '.'))
    if (Number.isFinite(n) && n > 0) saveReview({ corrected: n })
  }

  const toggleTera = () => {
    const next = { ...loadTeraTags() }
    if (next[card.id]) delete next[card.id]
    else next[card.id] = true
    saveTeraTags(next)
    bump()
  }

  const setWarning = (wkind: WarningKind) => {
    savePriceWarnings({ ...loadPriceWarnings(), [card.id]: { kind: wkind, note: note.trim() || undefined } })
    bump()
  }
  const clearWarning = () => {
    const next = { ...loadPriceWarnings() }
    delete next[card.id]
    savePriceWarnings(next)
    setNote('')
    bump()
  }

  return (
    <section className="panel admin-card-controls">
      <h2>✎ Admin edit</h2>
      <p className="muted admin-edit-hint">
        Captured for the next rebuild — the fair price won't change here until the model is re-run.
      </p>

      <div className="admin-edit-block">
        <span className="admin-edit-label">Artwork rating</span>
        <div className="rating-scale">
          {ARTWORK_SCALE.map((opt) => {
            const active = opt.value === 0 ? artwork != null && artwork < 8 : artwork === opt.value
            return (
              <button
                key={opt.label}
                type="button"
                className={active ? 'rating-btn active' : 'rating-btn'}
                onClick={() => setArtwork(opt.value)}
              >
                {opt.label}
              </button>
            )
          })}
          {artwork != null && (
            <button type="button" className="rating-clear" onClick={clearArtwork}>
              clear
            </button>
          )}
        </div>
      </div>

      {isEx && (
        <div className="admin-edit-block">
          <span className="admin-edit-label">Tera ex</span>
          <div className="admin-edit-row">
            <button
              type="button"
              className={isTera ? 'rating-btn active' : 'rating-btn'}
              onClick={toggleTera}
            >
              {isTera ? 'Tera ✓ (tap to clear)' : 'Mark as Tera'}
            </button>
          </div>
        </div>
      )}

      <div className="admin-edit-block">
        <span className="admin-edit-label">
          Trend price{' '}
          <span className="muted">
            (currently {card.market?.trend != null ? formatEuro(card.market.trend) : 'none'}
            {kind === 'corrected' ? ' · corrected' : kind === 'wrong' ? ' · marked wrong' : ''})
          </span>
        </span>
        <div className="admin-edit-row">
          <input
            type="text"
            inputMode="decimal"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="e.g. 0.42"
          />
          <button type="button" onClick={saveCorrectedPrice}>
            Save price
          </button>
          <button type="button" onClick={() => saveReview('wrong')}>
            Mark wrong
          </button>
          {review != null && (
            <button type="button" className="rating-clear" onClick={() => saveReview(null)}>
              clear
            </button>
          )}
        </div>
      </div>

      <div className="admin-edit-block">
        <span className="admin-edit-label">
          Price warning{' '}
          <span className="muted">shown to visitors as a caveat</span>
        </span>
        <div className="admin-edit-row">
          {WARNING_PRESETS.map((p) => (
            <button
              key={p.kind}
              type="button"
              className={warning?.kind === p.kind ? 'rating-btn active' : 'rating-btn'}
              onClick={() => setWarning(p.kind)}
            >
              {p.label}
            </button>
          ))}
          {warning && (
            <button type="button" className="rating-clear" onClick={clearWarning}>
              clear
            </button>
          )}
        </div>
        <textarea
          className="admin-edit-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => warning && setWarning(warning.kind)}
          placeholder="Optional custom wording (overrides the preset sentence)"
          rows={2}
        />
      </div>
    </section>
  )
}
