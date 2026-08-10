import { useMemo } from 'react'
import { RetryImage } from '../components/RetryImage'
import { useDocumentMeta } from '../logic/documentMeta'
import { formatDate } from '../data/cards'
import {
  PACKS_PER_BUNDLE,
  sealedInsights,
  sealedSets,
  type LangMetrics,
  type SetSealed,
} from '../logic/sealedMetrics'

const euro = (n: number | undefined): string =>
  n == null ? '—' : `€${n.toFixed(2)}`

/** A signed percentage, e.g. +18% / −6%, from a ratio-minus-one value. */
const pct = (r: number | undefined): string => {
  if (r == null) return '—'
  const v = Math.round(r * 100)
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`
}

const toneClass = (r: number | undefined): string =>
  r == null ? '' : r > 0.001 ? 'up' : r < -0.001 ? 'down' : ''

function PriceCell({ label, de, en }: { label: string; de?: number; en?: number }) {
  return (
    <div className="sealed-price-row">
      <span className="sealed-price-label">{label}</span>
      <span className="sealed-price-vals">
        <span>
          <span className="muted">DE</span> {euro(de)}
        </span>
        <span>
          <span className="muted">EN</span> {euro(en)}
        </span>
      </span>
    </div>
  )
}

function bestBundleLang(row: SetSealed): { m: LangMetrics; lang: 'DE' | 'EN' } | null {
  const options: { m: LangMetrics; lang: 'DE' | 'EN' }[] = []
  if (row.de.bundleVsSingle != null) options.push({ m: row.de, lang: 'DE' })
  if (row.en.bundleVsSingle != null) options.push({ m: row.en, lang: 'EN' })
  return options.sort((a, b) => (a.m.bundleVsSingle ?? 0) - (b.m.bundleVsSingle ?? 0))[0] ?? null
}

export function SealedPage() {
  const rows = useMemo(() => sealedSets(), [])
  const insights = useMemo(() => sealedInsights(rows), [rows])

  useDocumentMeta(
    'Sealed products — Mega Evolution booster prices compared',
    'Compare Booster, Sleeved Booster and Booster Bundle prices across every Mega Evolution set, in German and English — including the real per-pack cost of a bundle.',
    '/sealed',
  )

  return (
    <div className="sealed-page">
      <section className="hero-block">
        <h1>Sealed products — Mega Evolution</h1>
        <p>
          Booster, Sleeved Booster and Booster Bundle prices for every Mega Evolution set, side by
          side in German and English. There's no single &ldquo;fair&rdquo; price for sealed product —
          it's a judgement call — so this page shows the comparisons instead: what a pack really costs
          bought as a {PACKS_PER_BUNDLE}-pack bundle, what the sleeved version adds, and how far the
          English price runs ahead of the German one. You decide whether the base price is worth it.
        </p>
      </section>

      <section className="sealed-insights">
        <InsightCard
          label="Cheapest single pack"
          set={insights.cheapestPack?.setName}
          value={euro(insights.cheapestPack?.value)}
        />
        <InsightCard
          label="Best bundle value"
          hint="lowest per-pack price vs a single booster"
          set={insights.bestBundleValue?.setName}
          value={pct(insights.bestBundleValue?.value)}
        />
        <InsightCard
          label="Smallest sleeved premium"
          hint="EN sleeved over a plain booster"
          set={insights.smallestSleevedPremium?.setName}
          value={pct(insights.smallestSleevedPremium?.value)}
        />
        <InsightCard
          label="Smallest EN/DE gap"
          hint="English booster over German"
          set={insights.smallestLangGap?.setName}
          value={pct(insights.smallestLangGap?.value)}
        />
      </section>

      <div className="sealed-cards">
        {rows.map((row) => {
          const bundle = bestBundleLang(row)
          return (
            <section key={row.id} className="sealed-card">
              <header className="sealed-card-head">
                {row.logo ? (
                  <RetryImage
                    src={row.logo}
                    alt=""
                    loading="lazy"
                    placeholder={<span className="sealed-card-name">{row.name}</span>}
                  />
                ) : (
                  <span className="sealed-card-name">{row.name}</span>
                )}
                <div className="sealed-card-title">
                  <strong>{row.name}</strong>
                  <span className="muted">{formatDate(row.releaseDate)}</span>
                </div>
              </header>

              <div className="sealed-prices">
                <PriceCell label="Booster" de={row.de.booster} en={row.en.booster} />
                <PriceCell label="Booster Bundle" de={row.de.bundle} en={row.en.bundle} />
                <div className="sealed-price-row">
                  <span className="sealed-price-label">Sleeved Booster</span>
                  <span className="sealed-price-vals">
                    <span className="muted sealed-na">DE n/a</span>
                    <span>
                      <span className="muted">EN</span> {euro(row.en.sleeved)}
                    </span>
                  </span>
                </div>
              </div>

              <div className="sealed-derived">
                <div className="sealed-derived-item">
                  <span className="sealed-derived-label">Per pack in a bundle</span>
                  {bundle ? (
                    <span className="sealed-derived-value">
                      {euro(bundle.m.bundlePerPack)}{' '}
                      <span className="muted">({bundle.lang})</span>
                      <span className={`sealed-delta ${toneClass(bundle.m.bundleVsSingle)}`}>
                        {pct(bundle.m.bundleVsSingle)} vs single
                      </span>
                    </span>
                  ) : (
                    <span className="sealed-derived-value">—</span>
                  )}
                </div>

                <div className="sealed-derived-item">
                  <span className="sealed-derived-label">Sleeved premium (EN)</span>
                  <span className="sealed-derived-value">
                    {row.en.sleevedPremium != null ? (
                      <span className={`sealed-delta ${toneClass(row.en.sleevedPremium)}`}>
                        {pct(row.en.sleevedPremium)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>

                <div className="sealed-derived-item">
                  <span className="sealed-derived-label">English vs German</span>
                  <span className="sealed-derived-value sealed-lang-gaps">
                    <span>
                      Booster{' '}
                      <span className={`sealed-delta ${toneClass(row.enVsDeBooster)}`}>
                        {pct(row.enVsDeBooster)}
                      </span>
                    </span>
                    <span>
                      Bundle{' '}
                      <span className={`sealed-delta ${toneClass(row.enVsDeBundle)}`}>
                        {pct(row.enVsDeBundle)}
                      </span>
                    </span>
                  </span>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <p className="muted sealed-foot">
        Sealed prices are entered by hand from the current market and refreshed periodically. A
        Booster Bundle is {PACKS_PER_BUNDLE} packs. Not financial advice.
      </p>
    </div>
  )
}

function InsightCard({
  label,
  hint,
  set,
  value,
}: {
  label: string
  hint?: string
  set?: string
  value: string
}) {
  return (
    <div className="sealed-insight">
      <span className="sealed-insight-value">{value}</span>
      <span className="sealed-insight-label">{label}</span>
      <span className="muted sealed-insight-set">{set ?? '—'}</span>
      {hint && <span className="muted sealed-insight-hint">{hint}</span>}
    </div>
  )
}
