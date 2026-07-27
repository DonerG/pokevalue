import type { Config } from '../data/defaults'
import { formatPercent, verdict, type VerdictKind } from '../logic/pricing'

const CHIP: Record<string, { icon: string; label: string }> = {
  undervalued: { icon: '▲', label: 'undervalued' },
  fair: { icon: '✓', label: 'fair' },
  overvalued: { icon: '▼', label: 'overvalued' },
}

/** The three model variants, in zoom order (widest comparison circle first). */
const VIEWS: { key: 'broad' | 'standard' | 'local'; label: string }[] = [
  { key: 'broad', label: 'Wide view — vs. broadly similar cards everywhere' },
  { key: 'standard', label: 'Standard view — the balanced default' },
  { key: 'local', label: 'Close-up view — vs. same rarity in the same set' },
]

interface Props {
  market: number | null | undefined
  fair: number
  config: Config
  /** The three variant estimates behind `fair` (their median). When present,
   * the chip grows three dots — one per view — so agreement between the views
   * is visible at a glance: three matching dots = a solid verdict, mixed dots
   * = a boundary case where the answer depends on how you compare. */
  fairs?: { broad: number; standard: number; local: number }
}

export function VerdictChip({ market, fair, config, fairs }: Props) {
  if (market == null) return <span className="chip chip-none">no market price</span>
  const v = verdict(market, fair, config)
  if (!v) return <span className="chip chip-none">–</span>
  const { icon, label } = CHIP[v.kind]

  let dots: { kind: VerdictKind; title: string }[] | null = null
  if (fairs) {
    dots = []
    for (const view of VIEWS) {
      const vv = verdict(market, fairs[view.key], config)
      if (!vv) {
        dots = null
        break
      }
      dots.push({ kind: vv.kind, title: `${view.label}: ${CHIP[vv.kind].label} ${formatPercent(vv.deviation)}` })
    }
  }

  return (
    <span className={`chip chip-${v.kind}`}>
      <span aria-hidden="true">{icon}</span>
      <span className="chip-label">{label}</span>
      <span className="chip-value">{formatPercent(v.deviation)}</span>
      {dots && (
        <span className="chip-dots" aria-label="agreement of the three views">
          {dots.map((d, i) => (
            <span key={i} className={`chip-dot chip-dot-${d.kind}`} title={d.title} />
          ))}
        </span>
      )}
    </span>
  )
}
