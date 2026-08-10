/**
 * Bundles everything an editing session produced into one JSON download, so a
 * whole session comes back as a single attachment. Shared by the admin hub and
 * the site-wide admin bar. Reads the same localStorage stores the standalone
 * admin pages write, so nothing is missed.
 */
import { loadRatings } from './artworkRatings'
import { loadTeraTags } from './teraTags'
import { loadPriceExclusions } from './priceExclusions'
import { loadPriceWarnings } from './priceWarnings'
import { loadSealedPrices } from './sealedPrices'

export function exportAllAdminData(): void {
  const bundle = {
    artworkRatings: loadRatings(),
    teraTags: loadTeraTags(),
    priceExclusions: loadPriceExclusions(),
    priceWarnings: loadPriceWarnings(),
    sealedPrices: loadSealedPrices(),
    exportedAt: new Date().toISOString(),
  }
  const blob = new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'pokevalue-admin-export.json'
  a.click()
  URL.revokeObjectURL(url)
}
