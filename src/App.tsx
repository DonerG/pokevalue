import { useState } from 'react'
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
          <h1>PokéPreis</h1>
        </a>
        <nav className="main-nav">
          <a href="#/" className={route.page === 'home' || route.page === 'set' || route.page === 'karte' ? 'active' : ''}>
            Sets
          </a>
          <a href="#/rechner" className={route.page === 'rechner' ? 'active' : ''}>
            Freier Rechner
          </a>
        </nav>
      </header>

      {route.page === 'home' && <HomePage />}
      {route.page === 'set' && <SetPage setId={route.setId} config={config} />}
      {route.page === 'karte' && <CardPage key={route.cardId} cardId={route.cardId} config={config} />}
      {route.page === 'rechner' && (
        <CalculatorPage
          config={config}
          onChangeMultiplier={handleMultiplier}
          onChangeAnchor={handleAnchor}
          onChangeThreshold={handleThreshold}
          onReset={handleReset}
        />
      )}

      <footer className="app-footer">
        Die Formel ist ein Modell, kein Marktorakel — alle Multiplikatoren lassen sich im freien
        Rechner (Experten-Modus) anpassen. Keine Anlageberatung. Kartendaten und Preise von{' '}
        <a href="https://tcgdex.dev" target="_blank" rel="noreferrer">
          TCGdex
        </a>{' '}
        (Cardmarket). Inoffizielles Fanprojekt — nicht von Nintendo, Game Freak oder The Pokémon
        Company unterstützt oder autorisiert.
      </footer>
    </div>
  )
}

export default App
