import { useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { defaultConfig, type Config, type FactorId } from './data/defaults'
import { clearConfig, loadConfig, saveConfig } from './logic/storage'
import { useRoute } from './router'
import { HomePage } from './pages/HomePage'
import { SetPage } from './pages/SetPage'
import { CardPage } from './pages/CardPage'
import { CalculatorPage } from './pages/CalculatorPage'

function App() {
  const route = useRoute()
  const [config, setConfig] = useState<Config>(() => loadConfig())

  const updateConfig = (updater: (prev: Config) => Config) => {
    setConfig((prev) => {
      const next = updater(prev)
      saveConfig(next)
      return next
    })
  }

  const handleMultiplier = (factorId: FactorId, optionId: string, value: number) =>
    updateConfig((prev) => ({
      ...prev,
      multipliers: {
        ...prev.multipliers,
        [factorId]: { ...prev.multipliers[factorId], [optionId]: Number.isFinite(value) ? value : 0 },
      },
    }))

  const handleAnchor = (value: number) =>
    updateConfig((prev) => ({ ...prev, anchor: Number.isFinite(value) && value > 0 ? value : prev.anchor }))

  const handleThreshold = (key: 'over' | 'under', value: number) =>
    updateConfig((prev) => ({
      ...prev,
      thresholds: { ...prev.thresholds, [key]: Number.isFinite(value) && value >= 0 ? value : 0 },
    }))

  const handleReset = () => {
    clearConfig()
    setConfig(defaultConfig())
  }

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#/">
          <span className="pokeball" aria-hidden="true" />
          <h1>PokéValue</h1>
        </a>
        <nav className="main-nav">
          <a href="#/" className={route.page === 'home' || route.page === 'set' || route.page === 'card' ? 'active' : ''}>
            Sets
          </a>
          <a href="#/calculator" className={route.page === 'calculator' ? 'active' : ''}>
            Free Calculator
          </a>
        </nav>
      </header>

      {route.page === 'home' && <HomePage />}
      {route.page === 'set' && <SetPage setId={route.setId} config={config} />}
      {route.page === 'card' && <CardPage key={route.cardId} cardId={route.cardId} config={config} />}
      {route.page === 'calculator' && (
        <CalculatorPage
          config={config}
          onChangeMultiplier={handleMultiplier}
          onChangeAnchor={handleAnchor}
          onChangeThreshold={handleThreshold}
          onReset={handleReset}
        />
      )}

      <footer className="app-footer">
        The formula is a model, not a market oracle — every multiplier can be adjusted in the free
        calculator (expert mode). Not financial advice. Card data and prices from{' '}
        <a href="https://tcgdex.dev" target="_blank" rel="noreferrer">
          TCGdex
        </a>{' '}
        (Cardmarket). Unofficial fan project — not endorsed or supported by Nintendo, Game Freak, or
        The Pokémon Company.
      </footer>
      <Analytics />
    </div>
  )
}

export default App
