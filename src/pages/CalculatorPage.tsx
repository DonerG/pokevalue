import { useMemo, useState } from 'react'
import { defaultSelection, type Config, type FactorId } from '../data/defaults'
import { baseValue, fairPrice, score } from '../logic/pricing'
import { CardProfileForm } from '../components/CardProfileForm'
import { ExemplarForm } from '../components/ExemplarForm'
import { ResultPanel } from '../components/ResultPanel'
import { ExpertPanel } from '../components/ExpertPanel'

interface Props {
  config: Config
  onChangeMultiplier: (factorId: FactorId, optionId: string, value: number) => void
  onChangeAnchor: (value: number) => void
  onChangeThreshold: (key: 'over' | 'under', value: number) => void
  onReset: () => void
}

export function CalculatorPage({
  config,
  onChangeMultiplier,
  onChangeAnchor,
  onChangeThreshold,
  onReset,
}: Props) {
  const [selection, setSelection] = useState(() => defaultSelection())
  const [copyEnabled, setCopyEnabled] = useState(false)
  const [marketInput, setMarketInput] = useState('')

  const handleSelect = (factorId: FactorId, optionId: string) =>
    setSelection((prev) => ({ ...prev, [factorId]: optionId }))

  const results = useMemo(
    () => ({
      score: score(selection, config),
      base: baseValue(selection, config),
      fair: copyEnabled ? fairPrice(selection, config) : null,
    }),
    [selection, config, copyEnabled],
  )

  return (
    <main className="layout">
      <div className="forms">
        <CardProfileForm selection={selection} config={config} onSelect={handleSelect} />
        <ExemplarForm
          enabled={copyEnabled}
          onToggle={setCopyEnabled}
          selection={selection}
          config={config}
          onSelect={handleSelect}
        />
        <ExpertPanel
          config={config}
          onChangeMultiplier={onChangeMultiplier}
          onChangeAnchor={onChangeAnchor}
          onChangeThreshold={onChangeThreshold}
          onReset={onReset}
        />
      </div>
      <aside className="results">
        <ResultPanel
          score={results.score}
          baseValue={results.base}
          fairPrice={results.fair}
          marketInput={marketInput}
          onMarketInput={setMarketInput}
          config={config}
        />
      </aside>
    </main>
  )
}
