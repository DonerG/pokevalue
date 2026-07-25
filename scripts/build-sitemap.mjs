/**
 * Writes public/sitemap.xml listing the homepage, every set page, and every
 * card page. Only worth generating since the switch from hash routing to
 * real paths — with `#/card/x` a crawler saw one single URL for the whole
 * site, so a sitemap would have had nothing to point at.
 *
 * Admin pages (#/admin/...) are deliberately left out: they're internal
 * tooling, not content anyone should land on from a search result.
 *
 * Run after ingest.mjs (reads its output). Usage: node scripts/build-sitemap.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATED_DIR = join(HERE, '..', 'src', 'data', 'generated')
const OUT_FILE = join(HERE, '..', 'public', 'sitemap.xml')
const ORIGIN = 'https://pokevalue.cards'

const sets = JSON.parse(await readFile(join(GENERATED_DIR, 'sets.json'), 'utf8'))

const urls = [{ loc: `${ORIGIN}/`, priority: '1.0' }]

for (const set of sets) {
  urls.push({ loc: `${ORIGIN}/set/${encodeURIComponent(set.id)}`, priority: '0.8' })
}

let cardCount = 0
for (const set of sets) {
  const cards = JSON.parse(await readFile(join(GENERATED_DIR, `cards-${set.id}.json`), 'utf8'))
  for (const card of cards) {
    urls.push({ loc: `${ORIGIN}/card/${encodeURIComponent(card.id)}`, priority: '0.6' })
    cardCount++
  }
}

const body = urls
  .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <priority>${u.priority}</priority>\n  </url>`)
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`

await writeFile(OUT_FILE, xml)
console.log(`Wrote sitemap with ${urls.length} URLs (1 home + ${sets.length} sets + ${cardCount} cards) to ${OUT_FILE}`)
