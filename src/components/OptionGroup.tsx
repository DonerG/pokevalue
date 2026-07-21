import type { Config, FactorDef } from '../data/defaults'

interface Props {
  def: FactorDef
  config: Config
  value: string
  onChange: (optionId: string) => void
}

const multFmt = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 })

export function OptionGroup({ def, config, value, onChange }: Props) {
  return (
    <fieldset className="option-group">
      <legend>
        {def.label}
        <span className="factor-description">{def.description}</span>
      </legend>
      <div className="options" role="radiogroup" aria-label={def.label}>
        {def.options.map((o) => {
          const mult = config.multipliers[def.id][o.id]
          const active = o.id === value
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? 'option active' : 'option'}
              onClick={() => onChange(o.id)}
              title={o.hint}
            >
              <span className="option-label">{o.label}</span>
              {o.hint && <span className="option-hint">{o.hint}</span>}
              <span className="option-mult">×{multFmt.format(mult)}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
