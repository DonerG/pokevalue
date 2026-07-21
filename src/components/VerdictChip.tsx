import type { Config } from '../data/defaults'
import { formatPercent, verdict } from '../logic/pricing'

const CHIP: Record<string, { icon: string; label: string }> = {
  unterbewertet: { icon: '▼', label: 'unterbewertet' },
  fair: { icon: '✓', label: 'fair' },
  ueberbewertet: { icon: '▲', label: 'überbewertet' },
}

interface Props {
  market: number | null | undefined
  fair: number
  config: Config
}

export function VerdictChip({ market, fair, config }: Props) {
  if (market == null) return <span className="chip chip-none">kein Marktpreis</span>
  const v = verdict(market, fair, config)
  if (!v) return <span className="chip chip-none">–</span>
  const { icon, label } = CHIP[v.kind]
  return (
    <span className={`chip chip-${v.kind}`}>
      <span aria-hidden="true">{icon}</span> {label} {formatPercent(v.deviation)}
    </span>
  )
}
