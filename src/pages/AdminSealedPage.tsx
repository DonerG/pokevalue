import { useMemo, useRef, useState } from 'react'
import {
  MEGA_SETS,
  SEALED_LANGS,
  SEALED_LANG_LABELS,
  SEALED_PRODUCT_LABELS,
  getSealedPrice,
  hasSleeved,
  loadSealedPrices,
  productsForSet,
  saveSealedPrices,
  setSealedPrice,
  type SealedLang,
  type SealedPrices,
  type SealedProduct,
} from '../logic/sealedPrices'

const fieldKey = (setId: string, lang: SealedLang, product: SealedProduct) =>
  `${setId}:${lang}:${product}`

/** Average of a list of factors, or null when there is nothing to average. */
function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

const fmtFactor = (f: number | null): string => (f == null ? '—' : `×${f.toFixed(2)}`)

/**
 * Enter the real market price of each sealed product (Booster, Sleeved Booster,
 * Booster Bundle) in both German and English, per Mega Evolution set. There is
 * no computed fair price — the point is to read the *spreads*: how much more a
 * Bundle costs than a Booster, a Sleeved than a Booster, and English over
 * German. Feeding a handful of sets in gives a feel for the normal spread, so a
 * set whose spread is unusually small stands out as worth a closer look.
 */
export function AdminSealedPage() {
  const [prices, setPrices] = useState<SealedPrices>(() => loadSealedPrices())
  // In-progress input text, so typing "4." or clearing a field isn't fought by
  // the parsed number. Keyed by set:lang:product; absent = show the stored value.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const fileInput = useRef<HTMLInputElement>(null)

  const update = (setId: string, lang: SealedLang, product: SealedProduct, raw: string) => {
    setDrafts((d) => ({ ...d, [fieldKey(setId, lang, product)]: raw }))
    const trimmed = raw.trim().replace(',', '.')
    const value = trimmed === '' ? null : Number(trimmed)
    if (value != null && Number.isNaN(value)) return // keep the draft, don't store garbage
    setPrices((prev) => {
      const next = setSealedPrice(prev, setId, lang, product, value)
      saveSealedPrices(next)
      return next
    })
  }

  const inputValue = (setId: string, lang: SealedLang, product: SealedProduct): string => {
    const draft = drafts[fieldKey(setId, lang, product)]
    if (draft != null) return draft
    const stored = getSealedPrice(prices, setId, lang, product)
    return stored == null ? '' : String(stored)
  }

  // Per-set spreads plus the cross-set averages, recomputed as prices change.
  const { perSet, summary, filledCount } = useMemo(() => {
    const bundleOverBooster: number[] = []
    const sleevedOverBooster: number[] = []
    const enOverDe: Record<SealedProduct, number[]> = { booster: [], sleeved: [], bundle: [] }
    let filledCount = 0

    const perSet = MEGA_SETS.map((set) => {
      const get = (lang: SealedLang, product: SealedProduct) =>
        getSealedPrice(prices, set.id, lang, product)

      // Product spreads: average the factor across whichever languages have both legs.
      const bundleFactors: number[] = []
      const sleevedFactors: number[] = []
      for (const lang of SEALED_LANGS) {
        const b = get(lang, 'booster')
        if (b) {
          const bundle = get(lang, 'bundle')
          if (bundle) bundleFactors.push(bundle / b)
          const sleeved = get(lang, 'sleeved')
          if (sleeved) sleevedFactors.push(sleeved / b)
        }
      }
      const bundleFactor = mean(bundleFactors)
      const sleevedFactor = mean(sleevedFactors)
      if (bundleFactor != null) bundleOverBooster.push(bundleFactor)
      if (sleevedFactor != null) sleevedOverBooster.push(sleevedFactor)

      // Language spread per product: English over German.
      const enDe: Partial<Record<SealedProduct, number>> = {}
      for (const product of productsForSet(set.id)) {
        const de = get('de', product)
        const en = get('en', product)
        if (de && en) {
          enDe[product] = en / de
          enOverDe[product].push(en / de)
        }
      }

      for (const lang of SEALED_LANGS)
        for (const product of productsForSet(set.id)) if (get(lang, product)) filledCount++

      return { set, bundleFactor, sleevedFactor, enDe }
    })

    const summary = {
      bundleOverBooster: mean(bundleOverBooster),
      sleevedOverBooster: mean(sleevedOverBooster),
      enOverDe: {
        booster: mean(enOverDe.booster),
        sleeved: mean(enOverDe.sleeved),
        bundle: mean(enOverDe.bundle),
      } as Record<SealedProduct, number | null>,
      counts: {
        bundleOverBooster: bundleOverBooster.length,
        sleevedOverBooster: sleevedOverBooster.length,
      },
    }

    return { perSet, summary, filledCount }
  }, [prices])

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(prices, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sealed-prices.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file: File) => {
    file.text().then((text) => {
      try {
        const imported = JSON.parse(text) as SealedPrices
        setPrices((prev) => {
          const merged = { ...prev, ...imported }
          saveSealedPrices(merged)
          return merged
        })
        setDrafts({})
      } catch {
        alert('Could not read that file as sealed-price JSON.')
      }
    })
  }

  return (
    <div className="admin-sealed">
      <header className="admin-header">
        <h2>Sealed product prices</h2>
        <p className="muted">
          Enter the real market price of each product in both languages, per Mega Evolution set.
          There is no computed fair price here on purpose — the useful part is the{' '}
          <strong>spread</strong>: how much more a Bundle costs than a Booster, a Sleeved Booster
          than a Booster, and English over German. Fill a few sets in to get a feel for the normal
          spread; a set whose spread is unusually small is the one worth a closer look. Saved in this
          browser only — export the file when you're done.
        </p>
        <div className="admin-toolbar">
          <span className="admin-progress">{filledCount} prices entered</span>
          <button type="button" onClick={handleExport}>
            Export prices (JSON)
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import prices
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <section className="sealed-summary">
        <h3>Average spreads across filled sets</h3>
        <div className="sealed-summary-grid">
          <div className="sealed-stat">
            <span className="sealed-stat-value">{fmtFactor(summary.bundleOverBooster)}</span>
            <span className="muted">Bundle vs Booster ({summary.counts.bundleOverBooster})</span>
          </div>
          <div className="sealed-stat">
            <span className="sealed-stat-value">{fmtFactor(summary.sleevedOverBooster)}</span>
            <span className="muted">Sleeved vs Booster ({summary.counts.sleevedOverBooster})</span>
          </div>
          <div className="sealed-stat">
            <span className="sealed-stat-value">{fmtFactor(summary.enOverDe.booster)}</span>
            <span className="muted">EN vs DE · Booster</span>
          </div>
          <div className="sealed-stat">
            <span className="sealed-stat-value">{fmtFactor(summary.enOverDe.sleeved)}</span>
            <span className="muted">EN vs DE · Sleeved</span>
          </div>
          <div className="sealed-stat">
            <span className="sealed-stat-value">{fmtFactor(summary.enOverDe.bundle)}</span>
            <span className="muted">EN vs DE · Bundle</span>
          </div>
        </div>
      </section>

      <div className="sealed-sets">
        {perSet.map(({ set, bundleFactor, sleevedFactor, enDe }) => {
          const products = productsForSet(set.id)
          return (
            <section key={set.id} className="sealed-set-card">
              <div className="sealed-set-head">
                <h3>
                  {set.name} <span className="muted">{set.id}</span>
                </h3>
                {!hasSleeved(set.id) && <span className="sealed-tag">no Sleeved Booster</span>}
              </div>

              <table className="sealed-grid">
                <thead>
                  <tr>
                    <th />
                    {SEALED_LANGS.map((lang) => (
                      <th key={lang}>{SEALED_LANG_LABELS[lang]}</th>
                    ))}
                    <th className="sealed-grid-spread">EN / DE</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product}>
                      <th scope="row">{SEALED_PRODUCT_LABELS[product]}</th>
                      {SEALED_LANGS.map((lang) => (
                        <td key={lang}>
                          <div className="sealed-input">
                            <span className="sealed-euro">€</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              placeholder="—"
                              value={inputValue(set.id, lang, product)}
                              onChange={(e) => update(set.id, lang, product, e.target.value)}
                            />
                          </div>
                        </td>
                      ))}
                      <td className="sealed-grid-spread">{fmtFactor(enDe[product] ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="sealed-factors">
                <span>
                  Bundle vs Booster: <strong>{fmtFactor(bundleFactor)}</strong>
                </span>
                {hasSleeved(set.id) && (
                  <span>
                    Sleeved vs Booster: <strong>{fmtFactor(sleevedFactor)}</strong>
                  </span>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <p className="muted admin-hub-note">
        Prices live in this browser until you export the file and it's committed. Nothing here feeds
        the card model — it's a standalone reference for sealed products.
      </p>
    </div>
  )
}
