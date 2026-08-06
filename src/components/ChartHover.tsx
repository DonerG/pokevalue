import { formatEuro } from '../logic/pricing'

interface Pad {
  l: number
  r: number
  t: number
  b: number
}

interface Props {
  idx: number
  dates: string[]
  t: (number | null)[]
  f: number[]
  x: (i: number) => number
  y: (v: number) => number
  W: number
  H: number
  pad: Pad
  labels: { market: string; fair: string }
}

const BOX_W = 158
const BOX_H = 54

/**
 * Which day index a pointer at `clientX` is over, for the mouse/touch handlers
 * on the chart svg. Maps screen px → viewBox px → nearest data index, clamped.
 */
export function indexAtClientX(
  clientX: number,
  svg: SVGSVGElement,
  W: number,
  padL: number,
  innerW: number,
  n: number,
): number {
  const rect = svg.getBoundingClientRect()
  const svgX = ((clientX - rect.left) / rect.width) * W
  const i = Math.round(((svgX - padL) / innerW) * (n - 1))
  return Math.max(0, Math.min(n - 1, i))
}

/**
 * The read-out drawn on a price-history chart at the day under the cursor: a
 * vertical guide, a dot on each line, and a small box with that day's date,
 * market and fair value. Pure SVG so it scales with the chart; pointer-events
 * are off so it never steals the mousemove that drives it.
 */
export function ChartHover({ idx, dates, t, f, x, y, W, H, pad, labels }: Props) {
  const hx = x(idx)
  const market = t[idx]
  const fair = f[idx]
  // Flip the box to the left of the guide when it would overflow the right edge.
  const bx = hx + 10 + BOX_W > W - pad.r ? hx - 10 - BOX_W : hx + 10
  const by = pad.t + 2

  return (
    <g className="ph-hover" pointerEvents="none">
      <line className="ph-hover-line" x1={hx} y1={pad.t} x2={hx} y2={H - pad.b} />
      {market != null && <circle className="ph-dot ph-dot-trend" cx={hx} cy={y(market)} r={3.5} />}
      <circle className="ph-dot ph-dot-fair" cx={hx} cy={y(fair)} r={3.5} />
      <g transform={`translate(${bx.toFixed(1)}, ${by})`}>
        <rect className="ph-tooltip-bg" width={BOX_W} height={BOX_H} rx={6} />
        <text className="ph-tooltip-date" x={9} y={16}>
          {dates[idx]}
        </text>
        <text className="ph-tooltip-row ph-tt-market" x={9} y={32}>
          {labels.market} {market != null ? formatEuro(market) : '—'}
        </text>
        <text className="ph-tooltip-row ph-tt-fair" x={9} y={46}>
          {labels.fair} {formatEuro(fair)}
        </text>
      </g>
    </g>
  )
}
