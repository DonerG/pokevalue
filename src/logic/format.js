/**
 * Number formatting shared by the browser bundle and the Node build scripts.
 *
 * Plain JS on purpose (not .ts): scripts/prerender.mjs runs under bare Node
 * with no compile step, but the prices it writes into <title>/<meta> have to
 * be formatted byte-identically to what the running app shows — otherwise the
 * static HTML a crawler reads and the DOM a user sees would disagree. One
 * implementation, imported by both, makes that impossible.
 *
 * src/logic/pricing.ts re-exports these, so app code keeps importing them from
 * there as before.
 */

const euroFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
const euroFmtRound = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const euroFmt1 = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * @param {number} value
 * @returns {string}
 */
export function formatEuro(value) {
  return value >= 1000 ? euroFmtRound.format(value) : euroFmt.format(value)
}

/**
 * Compact one-decimal euro (e.g. "€33.4"), for tight spots where two decimals
 * would just add noise — the absolute over/undervaluation shown next to a
 * percentage.
 * @param {number} value
 * @returns {string}
 */
export function formatEuro1(value) {
  return euroFmt1.format(value)
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatPercent(value) {
  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toLocaleString('en-IE', { maximumFractionDigits: 0 })}%`
}
