import { defaultConfig, FACTORS, type Config } from '../data/defaults'

const KEY = 'pokevalue-config-v1'

/** Loads the saved configuration and layers it over the defaults (unknown keys are ignored). */
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
    // Ignore corrupted/foreign data, fall back to defaults
  }
  return config
}

export function saveConfig(config: Config): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(config))
  } catch {
    // localStorage unavailable (e.g. private browsing) — changes apply for this session only
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
