import { useEffect } from 'react'

export const SITE_NAME = 'PokéValue'
export const SITE_ORIGIN = 'https://pokevalue.cards'
const DEFAULT_TITLE = 'PokéValue – Card Value Calculator'
const DEFAULT_DESCRIPTION =
  'PokéValue estimates a fair price for Pokémon cards with a regression model trained on real Cardmarket data, and compares it against the current market price — set by set.'

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setLink(rel: string, href: string): void {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}

/**
 * Keeps <title>, the meta description, the canonical URL, and the Open Graph
 * tags in sync with the current route. Only meaningful now that routes are
 * real paths — with the old hash routing every page shared one URL, so per-
 * page metadata had nothing to attach to.
 *
 * This runs client-side, so a crawler that doesn't execute JS still sees only
 * index.html's defaults. Google does render JS and will pick these up; if
 * per-page metadata in the raw HTML ever becomes necessary, that needs
 * prerendering or SSR, which is a much larger change.
 */
export function useDocumentMeta(
  title: string | null,
  description: string | null,
  path: string,
): void {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE
    const desc = description ?? DEFAULT_DESCRIPTION
    const url = `${SITE_ORIGIN}${path}`

    document.title = fullTitle
    setMeta('meta[name="description"]', 'name', 'description', desc)
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle)
    setMeta('meta[property="og:description"]', 'property', 'og:description', desc)
    setMeta('meta[property="og:url"]', 'property', 'og:url', url)
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle)
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', desc)
    setLink('canonical', url)
  }, [title, description, path])
}
