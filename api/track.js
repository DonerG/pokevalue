/**
 * Anonymous, aggregate usage counting for the watchlist / portfolio "add"
 * actions — the free, first-party replacement for Vercel's paid custom events.
 *
 * Stores ONLY counters in a serverless key-value store (Upstash Redis, free
 * tier): a total per event and a per-card tally. No IP, no session id, no
 * per-person trail is written — nothing here can identify a visitor, and the
 * card id is data about a card, not a person. Best-effort: any failure is
 * swallowed so a hiccup in counting never affects the user's action.
 *
 * Env: KV_REST_API_URL/TOKEN (Vercel Storage → Upstash) or the
 * UPSTASH_REDIS_REST_URL/TOKEN pair. Absent (e.g. local dev) → the ping is a
 * no-op and returns 204.
 */
const ALLOWED = new Set(['watchlist_add', 'portfolio_add'])
// Card ids look like sv10.5b-147, me02.5-125, swshp-SWSH020 — a set part
// (lowercase, digits, dots) then "-" then an alphanumeric local id. Anything
// else is refused as a sorted-set member so the endpoint can't be used to
// write arbitrary keys.
const CARD_RE = /^[a-z0-9.]+-[A-Za-z0-9]+$/

function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

async function pipeline(commands) {
  const s = store()
  if (!s) return null
  const r = await fetch(`${s.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  return r.ok ? r.json() : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  const event = body?.event
  const card = body?.card
  // Unknown events are ignored rather than erroring — keeps the endpoint quiet
  // and uninteresting to probe.
  if (ALLOWED.has(event)) {
    const commands = [['INCR', `usage:${event}`]]
    if (typeof card === 'string' && card.length <= 40 && CARD_RE.test(card)) {
      commands.push(['ZINCRBY', `cards:${event}`, 1, card])
    }
    try {
      await pipeline(commands)
    } catch {
      // Counting is best-effort; never surface a failure to the caller.
    }
  }
  res.status(204).end()
}
