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
        <span className="step-badge">1</span> Karten-Profil
      </h2>
      <p className="panel-intro">
        Die festen Eigenschaften der Karte — sie bestimmen Basiswert und Score.
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
