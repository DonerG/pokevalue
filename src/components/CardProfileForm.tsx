import { CARD_FACTORS, type Config, type FactorId, type Selection } from '../data/defaults'
import { OptionGroup } from './OptionGroup'

interface Props {
  selection: Selection
  config: Config
  onSelect: (factorId: FactorId, optionId: string) => void
}

export function CardProfileForm({ selection, config, onSelect }: Props) {
  return (
    <section className="panel">
      <h2>
        <span className="step-badge">1</span> Card Profile
      </h2>
      <p className="panel-intro">
        The card's fixed properties — they determine the base value and score.
      </p>
      {CARD_FACTORS.map((def) => (
        <OptionGroup
          key={def.id}
          def={def}
          config={config}
          value={selection[def.id]}
          onChange={(optionId) => onSelect(def.id, optionId)}
        />
      ))}
    </section>
  )
}
