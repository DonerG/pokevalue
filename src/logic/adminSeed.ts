/**
 * Seeds the admin editing stores (localStorage) from the committed data the
 * first time the admin area is unlocked, so the per-card editor shows the TRUE
 * current state — a card already tagged Tera reads as Tera, an already-rated
 * card shows its grade — instead of looking blank because localStorage started
 * empty. Without this the editor can only add, never correct or clear, which is
 * exactly what the per-card editing is for.
 *
 * Runs once (guarded by a marker). Existing localStorage values win over the
 * committed seed, so any un-exported edits in progress survive. After seeding,
 * localStorage is the authority — including removals — so a session export is
 * the full intended state, not a diff.
 */
import artworkCommitted from '../data/artwork-ratings.json'
import teraCommitted from '../data/tera-tags.json'
import warningsCommitted from '../data/price-warnings.json'
import exclusionsCommitted from '../data/price-exclusions.json'
import sealedCommitted from '../data/sealed-prices.json'
import { loadRatings, saveRatings, type Ratings } from './artworkRatings'
import { loadTeraTags, saveTeraTags, type TeraTags } from './teraTags'
import { loadPriceWarnings, savePriceWarnings, type PriceWarnings } from './priceWarnings'
import { loadPriceExclusions, savePriceExclusions, type PriceExclusions } from './priceExclusions'
import { loadSealedPrices, saveSealedPrices, type SealedPrices } from './sealedPrices'

const SEEDED_KEY = 'pokevalue-admin-seeded-v1'

export function seedAdminStores(): void {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return
    saveRatings({ ...(artworkCommitted as Ratings), ...loadRatings() })
    saveTeraTags({ ...(teraCommitted as TeraTags), ...loadTeraTags() })
    savePriceWarnings({ ...(warningsCommitted as PriceWarnings), ...loadPriceWarnings() })
    savePriceExclusions({ ...(exclusionsCommitted as PriceExclusions), ...loadPriceExclusions() })
    saveSealedPrices({ ...(sealedCommitted as SealedPrices), ...loadSealedPrices() })
    localStorage.setItem(SEEDED_KEY, '1')
  } catch {
    // localStorage unavailable — nothing to seed
  }
}
