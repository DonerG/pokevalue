import { useEffect, useState, type ReactNode } from 'react'

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 1200

interface RetryImageProps {
  src: string
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
  /** Shown once every retry has failed (e.g. TCGdex genuinely has no image for this card). */
  placeholder?: ReactNode
}

/**
 * TCGdex's asset CDN occasionally times out or errors on the first request —
 * a plain <img> never retries, so that showed up as "some images just never
 * load until you reload the page". Remounting with a fresh key forces the
 * browser to reissue the request instead of replaying the failed one.
 */
export function RetryImage({ src, alt, className, loading = 'lazy', placeholder = null }: RetryImageProps) {
  const [attempt, setAttempt] = useState(0)
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    setAttempt(0)
    setGaveUp(false)
  }, [src])

  if (gaveUp) return <>{placeholder}</>

  return (
    <img
      key={attempt}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        if (attempt + 1 >= MAX_ATTEMPTS) {
          setGaveUp(true)
        } else {
          setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAY_MS)
        }
      }}
    />
  )
}
