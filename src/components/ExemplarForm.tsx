import { EXEMPLAR_FACTORS, type Config, type FactorId, type Selection } from '../data/defaults'
import { OptionGroup } from './OptionGroup'

interface Props {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  selection: Selection
  config: Config
  onSelect: (factorId: FactorId, optionId: string) => void
}

export function ExemplarForm({ enabled, onToggle, selection, config, onSelect }: Props) {
  return (
    <section className="panel">
      <h2>
        <span className="step-badge">2</span> Konkretes Exemplar
        <label className="toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="toggle-track" aria-hidden="true" />
          <span className="toggle-label">{enabled ? 'aktiv' : 'optional'}</span>
        </label>
      </h2>
      <p className="panel-intro">
        Du hast eine konkrete Karte im Auge? Dann gib Zustand, Sprache und Auflage an, um einen
        konkreten Preis zu erhalten.
      </p>
      {enabled &&
        EXEMPLAR_FACTORS.map((def) => (
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
