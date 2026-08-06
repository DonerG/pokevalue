/**
 * Fire-and-forget anonymous usage ping to our own /api/track (see api/track.js),
 * replacing Vercel's paid custom events. Sends only the event name and card id,
 * never waits for the response, and never throws — counting must not affect the
 * click that triggered it. A no-op wherever /api isn't served (local dev).
 */
export type UsageEvent = 'watchlist_add' | 'portfolio_add'

export function recordUsage(event: UsageEvent, card: string): void {
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, card }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // best-effort only
  }
}
