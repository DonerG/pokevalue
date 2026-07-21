import { defaultConfig, FACTORS, type Config } from '../data/defaults'

const KEY = 'pokepreis-config-v1'

/** Lädt die gespeicherte Konfiguration und legt sie über die Defaults (unbekannte Keys werden ignoriert). */
export function loadConfig(): Config {
  const config = defaultConfig()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return config
    const saved = JSON.parse(raw) as Partial<Config>
    if (typeof saved.anchor === 'number' && saved.anchor > 0) config.anchor = saved.anchor
    if (typeof saved.thresholds?.over === 'number') config.thresholds.over = saved.thresholds.over
    if (typeof saved.thresholds?.under === 'number') config.thresholds.under = saved.thresholds.under
    for (const f of FACTORS) {
      const savedFactor = saved.multipliers?.[f.id]
      if (!savedFactor) continue
      for (const o of f.options) {
        const v = savedFactor[o.id]
        if (typeof v === 'number' && v >= 0) config.multipliers[f.id][o.id] = v
      }
    }
  } catch {
    // Kaputte/fremde Daten ignorieren, Defaults verwenden
  }
  return config
}

export function saveConfig(config: Config): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(config))
  } catch {
    // localStorage nicht verfügbar (z. B. Privatmodus) — Änderungen gelten nur für die Sitzung
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignorieren
  }
}
