/**
 * Serves HTTP 410 Gone for the card and set URLs of sets that were taken off
 * the site, so search engines drop them quickly. Without this they hit the SPA
 * fallback, which answers 200 with a "Card not found" body — a soft 404, and
 * as far as a crawler's status code is concerned indistinguishable from a real
 * page. 410 is the strongest available "this is not coming back".
 *
 * Routed here by explicit per-set rules in vercel.json, NOT by a catch-all on
 * /card/:id. That is deliberate: a catch-all would be correct only if Vercel
 * checks the filesystem before applying rewrites (it does — every displayed
 * card is a real prerendered file in dist/), and if that assumption were ever
 * wrong it would take all 4,393 card pages down at once. Matching only the
 * removed sets' own prefixes cannot touch a live page under either ordering.
 *
 * To remove another set: delete it from sets.json, then add two rewrites in
 * vercel.json plus its id below. See README, "Adding or removing a set".
 */
const GONE_SET_IDS = new Set([
  'svp', // SVP Black Star Promos, removed 2026-07-29
  'mep', // MEP Black Star Promos, removed 2026-07-29
])

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} | PokéValue</title>
<style>
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
   background:#0f1115;color:#e7e9ee;text-align:center;
   font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
 main{padding:32px;max-width:44ch}
 h1{font-size:24px;letter-spacing:-.4px;margin:0 0 12px}
 p{color:#a9b0be;margin:0 0 24px}
 a{color:#7cc4ff}
 @media (prefers-color-scheme: light){
   body{background:#fff;color:#12141a} p{color:#5b6472} a{color:#0b62c4}
 }
</style></head><body><main>
<h1>${title}</h1><p>${body}</p><p><a href="/">Back to all sets</a></p>
</main></body></html>`
}

export default function handler(req, res) {
  // Falls back to 404 if vercel.json ever routes a set here that isn't listed
  // above — "gone" would be a claim we can't back up.
  const gone = GONE_SET_IDS.has(req.query.set)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Let a crawler re-check occasionally rather than cache the removal forever,
  // but don't make every hit re-run the function either.
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(gone ? 410 : 404).send(
    gone
      ? page(
          'This set is no longer listed',
          `The Black Star Promo sets were removed from PokéValue: promo prices depend
           mostly on how hard a card was to obtain, and that isn't in the data, so the
           fair prices here were not trustworthy enough to show.`,
        )
      : page('Card not found', `There is no card or set at this address.`),
  )
}
