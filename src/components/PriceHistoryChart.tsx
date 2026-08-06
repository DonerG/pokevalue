import { useEffect, useState } from 'react'
import { formatEuro } from '../logic/pricing'
import { ChartHover, indexAtClientX } from './ChartHover'

interface History {
  d: string[]
  t: (number | null)[]
  f: number[]
}

const W = 640
const H = 200
const PAD = { l: 48, r: 12, t: 12, b: 22 }

/** Break a series into continuous segments, skipping null gaps (missing trend days). */
function segments(values: (number | null)[]): number[][] {
  const segs: number[][] = []
  let cur: number[] = []
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segs.push(cur)
      cur = []
    } else {
      cur.push(i)
    }
  })
  if (cur.length) segs.push(cur)
  return segs
}

/**
 * The trend and fair price of a card over time, from the daily snapshots in
 * public/history/<setId>.json (see scripts/snapshot-prices.mjs). Fetched on
 * demand — the history files are static assets, never in the bundle. Renders
 * nothing until there are at least two days to draw a line, so a brand-new
 * card just doesn't show a chart yet.
 */
export function PriceHistoryChart({ cardId }: { cardId: string }) {
  const [data, setData] = useState<History | null | undefined>(undefined)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    const setId = cardId.slice(0, cardId.lastIndexOf('-'))
    fetch(`/history/${setId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => live && setData((h?.[cardId] as History) ?? null))
      .catch(() => live && setData(null))
    return () => {
      live = false
    }
  }, [cardId])

  if (data === undefined || !data || data.d.length < 2) return null

  const n = data.d.length
  const nums = [...data.t.filter((v): v is number => v != null), ...data.f]
  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (min === max) {
    min *= 0.95
    max *= 1.05
  }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (n === 1 ? 0 : (i / (n - 1)) * innerW)
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * innerH
  const path = (idxs: number[], series: (number | null)[]) =>
    idxs.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(series[i] as number).toFixed(1)}`).join(' ')

  const fmtDate = (s: string) => s.slice(5) // MM-DD

  return (
    <section className="panel price-history">
      <h2>Price history</h2>
      <div className="price-history-legend">
        <span className="ph-key ph-trend">Market trend</span>
        <span className="ph-key ph-fair">Fair price</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="price-history-svg"
        role="img"
        aria-label="Trend and fair price over time"
        onMouseMove={(e) => setHover(indexAtClientX(e.clientX, e.currentTarget, W, PAD.l, innerW, n))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(indexAtClientX(e.touches[0].clientX, e.currentTarget, W, PAD.l, innerW, n))}
        onTouchMove={(e) => setHover(indexAtClientX(e.touches[0].clientX, e.currentTarget, W, PAD.l, innerW, n))}
      >
        {/* y gridlines at min / mid / max */}
        {[min, (min + max) / 2, max].map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} className="ph-grid" />
            <text x={PAD.l - 6} y={y(v) + 3} className="ph-axis" textAnchor="end">
              {formatEuro(v)}
            </text>
          </g>
        ))}
        {/* fair line (drawn first, under trend) */}
        <path d={path([...data.f.keys()], data.f)} className="ph-line ph-fair-line" />
        {/* trend line, split at gaps */}
        {segments(data.t).map((seg, i) => (
          <path key={i} d={path(seg, data.t)} className="ph-line ph-trend-line" />
        ))}
        {/* x range labels */}
        <text x={PAD.l} y={H - 6} className="ph-axis" textAnchor="start">
          {fmtDate(data.d[0])}
        </text>
        <text x={W - PAD.r} y={H - 6} className="ph-axis" textAnchor="end">
          {fmtDate(data.d[n - 1])}
        </text>
        {hover != null && (
          <ChartHover
            idx={hover}
            dates={data.d}
            t={data.t}
            f={data.f}
            x={x}
            y={y}
            W={W}
            H={H}
            pad={PAD}
            labels={{ market: 'Market', fair: 'Fair' }}
          />
        )}
      </svg>
    </section>
  )
}
