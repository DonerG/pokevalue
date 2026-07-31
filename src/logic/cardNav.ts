/**
 * Remembers the ordered list of card ids the user is currently browsing — the
 * set page's filtered/sorted result — so a card page can offer prev/next in
 * that same order (arrows and keyboard). Kept in sessionStorage so it survives
 * the set→card navigation and even a reload of the card page; if it's missing
 * or the card isn't in it (someone opened a card link directly), prev/next just
 * aren't offered.
 */
const KEY = 'pokevalue-cardnav-v1'

export function setNavList(ids: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // sessionStorage unavailable — prev/next simply won't be offered
  }
}

function getNavList(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** The card before/after this one in the remembered order, or null at the ends / when unknown. */
export function neighbours(cardId: string): { prev: string | null; next: string | null } {
  const list = getNavList()
  const i = list.indexOf(cardId)
  if (i === -1) return { prev: null, next: null }
  return {
    prev: i > 0 ? list[i - 1] : null,
    next: i < list.length - 1 ? list[i + 1] : null,
  }
}
