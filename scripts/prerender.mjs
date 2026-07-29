/**
 * Bakes each route's metadata and a plain-HTML version of its content into the
 * built site, one `dist/<route>/index.html` per URL.
 *
 * Why: the app sets <title>/<meta> from JavaScript (src/logic/documentMeta.ts),
 * which Google's renderer does pick up — but only on a second pass that can lag
 * the initial crawl by days, and link-preview bots (Discord, WhatsApp, X,
 * Slack, Facebook) never run JavaScript at all, so every shared card link used
 * to preview as the generic homepage. Serving the real tags in the first byte
 * fixes both, and gives the initial crawl actual content to index instead of an
 * empty <div id="root">.
 *
 * How: the titles and descriptions come from src/logic/pageMeta.js and the
 * prices from src/logic/format.js — the very same modules the browser bundle
 * imports, so what a crawler reads can't drift from what a visitor sees. The
 * markup written into #root is real, visible content (the page still reads with
 * JavaScript disabled); React replaces it on mount, it is not a hidden
 * crawler-only copy.
 *
 * Vercel serves a matching static file before it applies the SPA rewrite in
 * vercel.json, so these files take precedence automatically and the rewrite
 * stays as the fallback for anything not prerendered.
 *
 * Run after `vite build` — `npm run build` chains it. Usage: node scripts/prerender.mjs
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatEuro, formatPercent } from '../src/logic/format.js'
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_ORIGIN,
  cardMeta,
  cardmarketUrl,
  homeMeta,
  howItWorksMeta,
  resolveDescription,
  resolveTitle,
  setMeta,
} from '../src/logic/pageMeta.js'
import { DEFAULT_THRESHOLDS, verdict } from '../src/logic/verdict.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = join(HERE, '..', 'dist')
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')

const CONFIG = { thresholds: DEFAULT_THRESHOLDS }

// ------------------------------------------------------------------ escaping

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** JSON-LD goes inside a <script>, so `<` must never appear literally in it. */
function jsonLd(...objects) {
  return objects
    .filter(Boolean)
    .map(
      (o) =>
        `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`,
    )
    .join('\n    ')
}

// ------------------------------------------------------------------ <head>

function headBlock({ title, description, path, image, largeImage = false }) {
  const url = `${SITE_ORIGIN}${path}`
  const fullTitle = resolveTitle(title)
  const desc = resolveDescription(description)
  const tags = [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta name="twitter:card" content="${largeImage && image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
  ]
  if (image) {
    tags.push(`<meta property="og:image" content="${esc(image)}" />`)
    tags.push(`<meta name="twitter:image" content="${esc(image)}" />`)
  }
  return tags.join('\n    ')
}

function breadcrumbs(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path}`,
    })),
  }
}

// ------------------------------------------------------------------ body shell

function shellHeader(crumbs) {
  const trail = crumbs
    .map((c) => (c.path ? `<a href="${esc(c.path)}">${esc(c.name)}</a>` : `<span>${esc(c.name)}</span>`))
    .join(' / ')
  return `<header class="prerender-head"><a class="prerender-brand" href="/">${esc(SITE_NAME)}</a><nav class="prerender-crumbs">${trail}</nav></header>`
}

function shell(crumbs, inner) {
  return `<div class="prerender-shell">${shellHeader(crumbs)}${inner}</div>`
}

function factRow(label, value) {
  return value == null || value === ''
    ? ''
    : `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`
}

function cardShell(card, set) {
  const meta = cardMeta(card, set)
  const trend = card.market?.trend
  // The description already states both prices, so this only adds the verdict
  // they imply — repeating the market price here read as a stutter.
  const v = trend != null ? verdict(trend, card.baseValue, CONFIG) : null
  const move = v ? formatPercent(Math.abs(v.deviation)).replace('+', '') : ''
  const judgement =
    v == null
      ? ''
      : v.kind === 'fair'
        ? ' That puts it inside the fair range.'
        : v.kind === 'undervalued'
          ? ` That makes it undervalued: the price could rise ${move} to reach the fair price.`
          : ` That makes it overvalued: the price could fall ${move} to reach the fair price.`

  const facts = [
    factRow('Set', set?.name),
    factRow('Number', `#${card.localId}`),
    factRow('Rarity', card.rarity),
    factRow('Card type', card.cardType),
    factRow('Illustrator', card.illustrator),
    factRow('Fair price', formatEuro(card.baseValue)),
    // No "Lowest listing" row. It was the one fact the prerendered page showed
    // that the React card page does not, so a crawler and a visitor saw
    // different content — and the site doesn't use market.low for anything
    // else either.
    factRow('Cardmarket price', trend != null ? formatEuro(trend) : null),
  ].join('')

  const inner =
    `<h1>${esc(card.name)} #${esc(card.localId)}${set ? ` – ${esc(set.name)}` : ''}</h1>` +
    `<p>${esc(meta.description)}${esc(judgement)}</p>` +
    `<dl class="prerender-facts">${facts}</dl>` +
    `<p class="prerender-links">` +
    (set ? `<a href="/set/${esc(set.id)}">All ${esc(set.name)} card prices</a> · ` : '') +
    `<a href="/how-it-works">How this price is calculated</a> · ` +
    `<a href="${esc(cardmarketUrl(card))}" rel="nofollow noreferrer">View on Cardmarket</a>` +
    `</p>`

  return shell(
    [
      { name: 'Sets', path: '/' },
      ...(set ? [{ name: set.name, path: `/set/${set.id}` }] : []),
      { name: `${card.name} #${card.localId}` },
    ],
    inner,
  )
}

function cardStructuredData(card, set) {
  const trend = card.market?.trend
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${card.name} #${card.localId}${set ? ` (${set.name})` : ''}`,
    description: cardMeta(card, set).description,
    sku: card.id,
    category: 'Trading Card Game > Pokémon',
    brand: { '@type': 'Brand', name: 'Pokémon' },
  }
  if (card.image) product.image = `${card.image}/high.webp`
  // Only when there is a real Cardmarket price behind it — never invented.
  //
  // A single Offer at the TREND price, which is the number the page leads with.
  // This used to be an AggregateOffer spanning market.low to trend. market.low
  // differs from the trend price on 93% of cards and is less than half of it on
  // 2,409 of them, so a snippet built from that range advertised a price the
  // visitor would not find on arrival. Google's rules ask that structured data
  // "must be a true representation of the page content" and that you not "mark
  // up content that is not visible to readers of the page"; the range only ever
  // half-satisfied that, since market.low appeared in the prerendered HTML but
  // never in the hydrated React page. The trend price is the one figure both
  // renderings agree on, which is what makes it the safe one to mark up.
  // (The prerendered "Lowest listing" row is gone now too, so market.low is no
  // longer displayed anywhere.)
  //
  // Hand-corrected cards carry their corrected value in market.trend (with
  // avg30 and low null), so this stays in step with the page for those too.
  //
  // The Offer describes Cardmarket's price and links there — this site sells
  // nothing. That is the "product snippet" case in Google's docs, explicitly
  // meant for pages "where people can't directly purchase the product"; the
  // stricter "merchant listing" rules don't apply. No availability or
  // priceValidUntil for the same reason: we'd be inventing stock we can't see.
  if (trend != null) {
    product.offers = {
      '@type': 'Offer',
      priceCurrency: 'EUR',
      price: Number(trend.toFixed(2)),
      url: cardmarketUrl(card),
    }
  }
  return product
}

function setShell(set, cards) {
  const meta = setMeta(set)
  const list = cards
    .map((c) => {
      const trend = c.market?.trend
      const price = trend != null ? ` — market ${formatEuro(trend)}` : ''
      return `<li><a href="/card/${esc(c.id)}">${esc(c.name)} #${esc(c.localId)}</a> <span>fair ${esc(formatEuro(c.baseValue))}${esc(price)}</span></li>`
    })
    .join('')

  const inner =
    `<h1>${esc(set.name)} card prices</h1>` +
    `<p>${esc(meta.description)}</p>` +
    `<ul class="prerender-list">${list}</ul>` +
    `<p class="prerender-links"><a href="/">All sets</a> · <a href="/how-it-works">How these prices are calculated</a></p>`

  return shell([{ name: 'Sets', path: '/' }, { name: set.name }], inner)
}

function homeShell(sets) {
  const list = sets
    .map(
      (s) =>
        `<li><a href="/set/${esc(s.id)}">${esc(s.name)}</a> <span>${esc(s.cardCount)} cards${s.releaseDate ? ` · ${esc(s.releaseDate)}` : ''}</span></li>`,
    )
    .join('')

  const inner =
    // Kept identical to HomePage.tsx's h1, so the crawler's first byte and the
    // hydrated DOM say the same thing.
    `<h1>${esc(SITE_NAME)} — what is a Pokémon card really worth?</h1>` +
    `<p>${esc(DEFAULT_DESCRIPTION)}</p>` +
    `<p>Pokémon, rarity, illustrator, set, and card type each get their own factor computed from real Cardmarket prices across ~19,000 cards. Compare the result with the current market price and see whether a card is over- or undervalued.</p>` +
    `<h2>Sets</h2>` +
    `<ul class="prerender-list">${list}</ul>` +
    `<p class="prerender-links"><a href="/how-it-works">How the fair price is calculated</a></p>`

  return shell([{ name: 'Sets' }], inner)
}

function howItWorksShell() {
  const meta = howItWorksMeta()
  const inner =
    `<h1>How the fair price is calculated</h1>` +
    `<p>${esc(meta.description)}</p>` +
    `<p>Every card starts from one base rate and is multiplied by a factor for its Pokémon, its rarity, its illustrator, its set, its card type, and two era-specific corrections — because what a rarity or a card type is worth has been redefined repeatedly over the game's history. The factors are not hand-picked: they are fitted jointly by a ridge regression on real Cardmarket prices, so each one is what remains after the others are accounted for.</p>` +
    `<p class="prerender-links"><a href="/">Browse all sets</a></p>`
  return shell([{ name: 'Sets', path: '/' }, { name: 'How it works' }], inner)
}

// ------------------------------------------------------------------ writing

// The home page is written back over dist/index.html, which is also the
// template — so both seams are re-emitted with their markers intact, letting
// the script run again on an already-prerendered dist without a fresh
// `vite build` in between.
const SEO_BLOCK = /<!--seo-->[\s\S]*?<!--\/seo-->/
const ROOT_DIV = /<div id="root">(?:<!--shell-->[\s\S]*?<!--\/shell-->)?<\/div>/

const template = await readFile(join(DIST, 'index.html'), 'utf8')

if (!SEO_BLOCK.test(template) || !ROOT_DIV.test(template)) {
  throw new Error(
    'dist/index.html has neither the <!--seo--> markers nor an empty <div id="root"> — ' +
      'either index.html changed without updating scripts/prerender.mjs, or dist/ ' +
      'predates them. Re-run `vite build`.',
  )
}

function renderPage({ head, structuredData, body }) {
  const headHtml = structuredData ? `${head}\n    ${structuredData}` : head
  return template
    .replace(SEO_BLOCK, `<!--seo-->\n    ${headHtml}\n    <!--/seo-->`)
    .replace(ROOT_DIV, `<div id="root"><!--shell-->${body}<!--/shell--></div>`)
}

const pages = []

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))
const setById = new Map(sets.map((s) => [s.id, s]))

const home = homeMeta()
pages.push({
  path: '/',
  html: renderPage({
    head: headBlock({ ...home, path: '/' }),
    structuredData: jsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      description: DEFAULT_DESCRIPTION,
    }),
    body: homeShell(sets),
  }),
})

const how = howItWorksMeta()
pages.push({
  path: '/how-it-works',
  html: renderPage({
    head: headBlock({ ...how, path: '/how-it-works' }),
    structuredData: jsonLd(
      breadcrumbs([
        { name: 'Sets', path: '/' },
        { name: 'How it works', path: '/how-it-works' },
      ]),
    ),
    body: howItWorksShell(),
  }),
})

let cardCount = 0
for (const set of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8'))
  const path = `/set/${set.id}`
  const meta = setMeta(set)

  pages.push({
    path,
    html: renderPage({
      head: headBlock({ ...meta, path, image: set.logo ? `${set.logo}.webp` : null }),
      structuredData: jsonLd(
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: resolveTitle(meta.title),
          description: resolveDescription(meta.description),
          url: `${SITE_ORIGIN}${path}`,
        },
        breadcrumbs([
          { name: 'Sets', path: '/' },
          { name: set.name, path },
        ]),
      ),
      body: setShell(set, cards),
    }),
  })

  for (const card of cards) {
    const cardPath = `/card/${card.id}`
    const cardSet = setById.get(set.id)
    pages.push({
      path: cardPath,
      html: renderPage({
        head: headBlock({
          ...cardMeta(card, cardSet),
          path: cardPath,
          image: card.image ? `${card.image}/high.webp` : null,
          largeImage: true,
        }),
        structuredData: jsonLd(
          cardStructuredData(card, cardSet),
          breadcrumbs([
            { name: 'Sets', path: '/' },
            { name: cardSet.name, path: `/set/${set.id}` },
            { name: `${card.name} #${card.localId}`, path: cardPath },
          ]),
        ),
        body: cardShell(card, cardSet),
      }),
    })
    cardCount++
  }
}

// Written as flat `<route>.html` files, served extensionless thanks to
// "cleanUrls": true in vercel.json — that mapping ("a static file named
// about.html will be served when visiting the /about path") is the one Vercel
// documents explicitly, whereas serving `about/index.html` at `/about` is only
// implied. Both very likely work, but this whole script exists to be correct
// for crawlers, so it uses the guaranteed one.
await mkdir(join(DIST, 'card'), { recursive: true })
await mkdir(join(DIST, 'set'), { recursive: true })

// Windows filesystem calls dominate the runtime here, so write in batches
// rather than one-at-a-time or all-at-once.
const BATCH = 64
for (let i = 0; i < pages.length; i += BATCH) {
  await Promise.all(
    pages.slice(i, i + BATCH).map((page) =>
      writeFile(join(DIST, page.path === '/' ? 'index.html' : `${page.path}.html`), page.html),
    ),
  )
}

// Sanity check: a stale dist/ would silently produce pages that reference
// assets which no longer exist, so confirm the bundle the template points at
// is really there.
const assets = await readdir(join(DIST, 'assets'))
const scriptSrc = template.match(/<script[^>]+src="\/assets\/([^"]+)"/)?.[1]
if (scriptSrc && !assets.includes(scriptSrc)) {
  throw new Error(`dist/index.html references /assets/${scriptSrc}, which is missing from dist/assets`)
}

console.log(
  `Prerendered ${pages.length} pages (1 home + 1 how-it-works + ${sets.length} sets + ${cardCount} cards) into ${DIST}`,
)
