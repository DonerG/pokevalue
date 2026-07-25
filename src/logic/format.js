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

/**
 * @param {number} value
 * @returns {string}
 */
export function formatEuro(value) {
  return value >= 1000 ? euroFmtRound.format(value) : euroFmt.format(value)
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
