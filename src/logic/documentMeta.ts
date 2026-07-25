import { useEffect } from 'react'
import { SITE_ORIGIN, resolveDescription, resolveTitle } from './pageMeta.js'

export { SITE_NAME, SITE_ORIGIN } from './pageMeta.js'

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
 * Keeps <title>, the meta description, the canonical URL, and the Open Graph /
 * Twitter tags in sync with the current route. Only meaningful now that routes
 * are real paths — with the old hash routing every page shared one URL, so
 * per-page metadata had nothing to attach to.
 *
 * The same values are also baked into the static HTML at build time by
 * scripts/prerender.mjs (both read src/logic/pageMeta.js), so a crawler that
 * never executes JavaScript already sees the right tags. This hook is what
 * keeps them correct across client-side navigations, where no new document is
 * ever fetched.
 */
export function useDocumentMeta(
  title: string | null,
  description: string | null,
  path: string,
  image?: string | null,
): void {
  useEffect(() => {
    const fullTitle = resolveTitle(title)
    const desc = resolveDescription(description)
    const url = `${SITE_ORIGIN}${path}`

    document.title = fullTitle
    setMeta('meta[name="description"]', 'name', 'description', desc)
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle)
    setMeta('meta[property="og:description"]', 'property', 'og:description', desc)
    setMeta('meta[property="og:url"]', 'property', 'og:url', url)
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle)
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', desc)
    setLink('canonical', url)

    if (image) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', image)
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image)
      setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image')
    }
  }, [title, description, path, image])
}
