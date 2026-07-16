import { useEffect } from 'react'

const SITE = 'https://walkietalkie.so'

interface SeoProps {
  /** Page <title>. Include the brand, e.g. "… | Walkie Talkie". */
  title: string
  /** Meta description (~150–160 chars). */
  description: string
  /** Path only, e.g. "/blog/my-post" — combined with the site origin. */
  path: string
  /** OG/Twitter preview image (absolute URL or site-relative path). */
  image?: string
  /** OG type — "article" for posts, "website" for landing pages. */
  type?: string
  /** JSON-LD structured data (an object or array of objects). */
  jsonLd?: unknown
}

/**
 * Dependency-free document-head manager for a Vite SPA. Sets the per-page
 * title, meta description, canonical URL, Open Graph + Twitter card tags, and
 * optional JSON-LD structured data on mount, and removes them on unmount so
 * one route's metadata never leaks into another. Renders nothing.
 *
 * NOTE: this runs client-side, so Google (which renders JS) sees everything,
 * but non-JS social scrapers still read the static index.html shell. Fully
 * fixing link-preview cards for scrapers would require prerendering/SSG.
 */
export default function Seo({ title, description, path, image, type = 'article', jsonLd }: SeoProps) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = title

    const url = SITE + path
    const img = image ? (image.startsWith('http') ? image : SITE + image) : undefined
    const created: HTMLElement[] = []

    const addMeta = (attr: 'name' | 'property', key: string, content: string) => {
      const el = document.createElement('meta')
      el.setAttribute(attr, key)
      el.setAttribute('content', content)
      el.setAttribute('data-seo', '')
      document.head.appendChild(el)
      created.push(el)
    }

    addMeta('name', 'description', description)
    addMeta('property', 'og:title', title)
    addMeta('property', 'og:description', description)
    addMeta('property', 'og:type', type)
    addMeta('property', 'og:url', url)
    addMeta('property', 'og:site_name', 'Walkie Talkie')
    addMeta('name', 'twitter:card', img ? 'summary_large_image' : 'summary')
    addMeta('name', 'twitter:title', title)
    addMeta('name', 'twitter:description', description)
    if (img) {
      addMeta('property', 'og:image', img)
      addMeta('name', 'twitter:image', img)
    }

    const canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    canonical.setAttribute('href', url)
    canonical.setAttribute('data-seo', '')
    document.head.appendChild(canonical)
    created.push(canonical)

    if (jsonLd) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.setAttribute('data-seo', '')
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
      created.push(script)
    }

    return () => {
      document.title = prevTitle
      created.forEach((el) => el.remove())
    }
  }, [title, description, path, image, type, jsonLd])

  return null
}
