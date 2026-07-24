import type { Config } from '../data/defaults'
import { formatPercent, verdict } from '../logic/pricing'

const CHIP: Record<string, { icon: string; label: string }> = {
  undervalued: { icon: '▲', label: 'undervalued' },
  fair: { icon: '✓', label: 'fair' },
  overvalued: { icon: '▼', label: 'overvalued' },
}

interface Props {
  market: number | null | undefined
  fair: number
  config: Config
}

export function VerdictChip({ market, fair, config }: Props) {
  if (market == null) return <span className="chip chip-none">no market price</span>
  const v = verdict(market, fair, config)
  if (!v) return <span className="chip chip-none">–</span>
  const { icon, label } = CHIP[v.kind]
  return (
    <span className={`chip chip-${v.kind}`}>
      <span aria-hidden="true">{icon}</span>
      <span className="chip-label">{label}</span>
      <span className="chip-value">{formatPercent(v.deviation)}</span>
    </span>
  )
}
