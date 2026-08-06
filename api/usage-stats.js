/**
 * Reads back the aggregate usage counters written by api/track.js, for the
 * owner-only /admin/usage page. Protected by a shared secret in the USAGE_TOKEN
 * env var (NOT the client-side admin hash, which is public in the repo): the
 * counts are low-stakes but this keeps them off the open web. If USAGE_TOKEN is
 * unset the endpoint refuses rather than exposing the numbers by default.
 *
 * Env: USAGE_TOKEN (a secret you choose) + the same Upstash vars as api/track.
 */
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

/** Upstash ZREVRANGE … WITHSCORES returns a flat [member, score, member, …]. */
function parseZ(arr) {
  const out = []
  if (Array.isArray(arr)) {
    for (let i = 0; i + 1 < arr.length; i += 2) out.push({ card: arr[i], count: Number(arr[i + 1]) })
  }
  return out
}

export default async function handler(req, res) {
  const expected = process.env.USAGE_TOKEN
  if (!expected) {
    res.status(503).json({ error: 'USAGE_TOKEN not set on the server.' })
    return
  }
  if (req.query.token !== expected) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  const out = await pipeline([
    ['GET', 'usage:watchlist_add'],
    ['GET', 'usage:portfolio_add'],
    ['ZREVRANGE', 'cards:watchlist_add', 0, 24, 'WITHSCORES'],
    ['ZREVRANGE', 'cards:portfolio_add', 0, 24, 'WITHSCORES'],
  ])
  if (!out) {
    res.status(503).json({ error: 'Usage store not configured.' })
    return
  }
  const val = (i) => out[i]?.result
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    watchlistAdds: Number(val(0) || 0),
    portfolioAdds: Number(val(1) || 0),
    topWatch: parseZ(val(2)),
    topPortfolio: parseZ(val(3)),
  })
}
