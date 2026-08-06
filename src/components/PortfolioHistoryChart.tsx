import { useEffect, useState } from 'react'
import { formatEuro } from '../logic/pricing'
import { ChartHover, indexAtClientX } from './ChartHover'

interface CardHistory {
  d: string[]
  t: (number | null)[]
  f: number[]
}

interface Aggregated {
  d: string[]
  t: (number | null)[]
  f: number[]
}

const W = 640
const H = 200
const PAD = { l: 52, r: 12, t: 12, b: 22 }

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
 * Aggregates the daily snapshots (public/history/<set>.json) of every held card
 * into the portfolio's total market and fair value over time, weighted by how
 * many copies are held now (holdings are treated as constant back through time —
 * "what today's portfolio was worth on each past date"). A date's market total
 * counts only the cards that had a market price that day.
 */
async function aggregate(qtyByCard: Record<string, number>): Promise<Aggregated | null> {
  const ids = Object.keys(qtyByCard)
  if (!ids.length) return null
  const setIds = [...new Set(ids.map((id) => id.slice(0, id.lastIndexOf('-'))))]

  const histories = await Promise.all(
    setIds.map((setId) =>
      fetch(`/history/${setId}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ),
  )
  const bySet: Record<string, Record<string, CardHistory>> = {}
  setIds.forEach((setId, i) => (bySet[setId] = histories[i] ?? {}))

  // Union of all snapshot dates across held cards, chronological.
  const dateSet = new Set<string>()
  for (const id of ids) {
    const setId = id.slice(0, id.lastIndexOf('-'))
    const h = bySet[setId]?.[id]
    if (h) for (const d of h.d) dateSet.add(d)
  }
  const dates = [...dateSet].sort()
  if (dates.length < 2) return null

  const t: (number | null)[] = []
  const f: number[] = []
  for (const date of dates) {
    let marketSum = 0
    let anyMarket = false
    let fairSum = 0
    for (const id of ids) {
      const setId = id.slice(0, id.lastIndexOf('-'))
      const h = bySet[setId]?.[id]
      if (!h) continue
      const idx = h.d.indexOf(date)
      if (idx === -1) continue
      const qty = qtyByCard[id]
      const tv = h.t[idx]
      if (tv != null) {
        marketSum += tv * qty
        anyMarket = true
      }
      const fv = h.f[idx]
      if (fv != null) fairSum += fv * qty
    }
    t.push(anyMarket ? Number(marketSum.toFixed(2)) : null)
    f.push(Number(fairSum.toFixed(2)))
  }
  return { d: dates, t, f }
}

export function PortfolioHistoryChart({ qtyByCard }: { qtyByCard: Record<string, number> }) {
  const [data, setData] = useState<Aggregated | null | undefined>(undefined)
  const [hover, setHover] = useState<number | null>(null)
  // Re-aggregate whenever the holdings change; the key captures ids + quantities.
  const key = Object.entries(qtyByCard)
    .sort()
    .map(([id, q]) => `${id}:${q}`)
    .join(',')

  useEffect(() => {
    let live = true
    setData(undefined)
    aggregate(qtyByCard)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (data === undefined || !data || data.d.length < 2) return null

  const n = data.d.length
  const nums = [...data.t.filter((v): v is number => v != null), ...data.f]
  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (min === max) {
    min *= 0.95
    max *= 1.05
  }
  // A value floor of 0 reads more honestly for a portfolio total than a zoomed
  // baseline that exaggerates day-to-day wiggle.
  min = Math.min(min, 0)
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (n === 1 ? 0 : (i / (n - 1)) * innerW)
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * innerH
  const path = (idxs: number[], series: (number | null)[]) =>
    idxs.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(series[i] as number).toFixed(1)}`).join(' ')
  const fmtDate = (s: string) => s.slice(5)

  return (
    <section className="panel price-history">
      <h2>Portfolio value over time</h2>
      <div className="price-history-legend">
        <span className="ph-key ph-trend">Market value</span>
        <span className="ph-key ph-fair">Fair value</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="price-history-svg"
        role="img"
        aria-label="Portfolio market and fair value over time"
        onMouseMove={(e) => setHover(indexAtClientX(e.clientX, e.currentTarget, W, PAD.l, innerW, n))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(indexAtClientX(e.touches[0].clientX, e.currentTarget, W, PAD.l, innerW, n))}
        onTouchMove={(e) => setHover(indexAtClientX(e.touches[0].clientX, e.currentTarget, W, PAD.l, innerW, n))}
      >
        {[min, (min + max) / 2, max].map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} className="ph-grid" />
            <text x={PAD.l - 6} y={y(v) + 3} className="ph-axis" textAnchor="end">
              {formatEuro(v)}
            </text>
          </g>
        ))}
        <path d={path([...data.f.keys()], data.f)} className="ph-line ph-fair-line" />
        {segments(data.t).map((seg, i) => (
          <path key={i} d={path(seg, data.t)} className="ph-line ph-trend-line" />
        ))}
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
