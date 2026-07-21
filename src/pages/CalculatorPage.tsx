import { useMemo, useState } from 'react'
import { defaultSelection, type Config, type FactorId } from '../data/defaults'
import { baseValue, fairPrice, score } from '../logic/pricing'
import { CardProfileForm } from '../components/CardProfileForm'
import { ExemplarForm } from '../components/ExemplarForm'
import { ResultPanel } from '../components/ResultPanel'

interface Props {
  config: Config
}

export function CalculatorPage({ config }: Props) {
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
      </div>
      <aside className="results">
        <ResultPanel
          score={results.score}
          baseValue={results.base}
          fairPrice={results.fair}
          marketInput={marketInput}
          onMarketInput={setMarketInput}
          config={config}
          selection={selection}
        />
      </aside>
    </main>
  )
}
