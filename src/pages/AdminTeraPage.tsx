import { useEffect, useMemo, useRef, useState } from 'react'
import { loadTeraCandidates, type TeraCandidate } from '../data/cards'
import { loadTeraTags, saveTeraTags, type TeraTags } from '../logic/teraTags'
import { formatEuro } from '../logic/pricing'
import { RetryImage } from '../components/RetryImage'

function cardThumb(c: TeraCandidate): string | null {
  return c.image ? `${c.image}/low.webp` : null
}

/**
 * Tag which Scarlet & Violet ex cards are Tera. A Tera Pokémon ex trades above
 * a plain ex and nothing in the data marks it (see cardMapping.mjs), so the
 * split is done by eye here. Tap a card to mark it Tera, tap again to clear;
 * anything left untouched counts as a normal ex. One set at a time.
 */
export function AdminTeraPage() {
  const [candidates, setCandidates] = useState<TeraCandidate[] | null>(null)
  const [tags, setTags] = useState<TeraTags>(() => loadTeraTags())
  const [activeSet, setActiveSet] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadTeraCandidates().then((c) => {
      setCandidates(c)
      setActiveSet((prev) => prev ?? c[0]?.setId ?? null)
    })
  }, [])

  const toggle = (cardId: string) => {
    setTags((prev) => {
      const next = { ...prev }
      if (next[cardId]) delete next[cardId]
      else next[cardId] = true
      saveTeraTags(next)
      return next
    })
  }

  // Sets in display order, each with its ex count and how many are tagged Tera.
  const sets = useMemo(() => {
    if (!candidates) return []
    const bySet = new Map<string, { id: string; name: string; total: number; tera: number }>()
    for (const c of candidates) {
      const e = bySet.get(c.setId) ?? { id: c.setId, name: c.setName, total: 0, tera: 0 }
      e.total += 1
      if (tags[c.id]) e.tera += 1
      bySet.set(c.setId, e)
    }
    return [...bySet.values()]
  }, [candidates, tags])

  const shown = useMemo(
    () => (candidates ?? []).filter((c) => c.setId === activeSet),
    [candidates, activeSet],
  )

  const totalTera = candidates ? candidates.filter((c) => tags[c.id]).length : 0

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(tags, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tera-tags.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file: File) => {
    file.text().then((text) => {
      try {
        const imported = JSON.parse(text) as TeraTags
        setTags((prev) => {
          const merged = { ...prev, ...imported }
          saveTeraTags(merged)
          return merged
        })
      } catch {
        alert('Could not read that file as JSON tags.')
      }
    })
  }

  return (
    <div className="admin-tera">
      <header className="admin-header">
        <h2>Tera ex tagging</h2>
        <p className="muted">
          A <strong>Tera</strong> Pokémon ex (the crystalline card frame) sells for more than a plain
          ex of the same rarity, and nothing in the card data marks it — so tag it by eye here. Tap
          every Tera ex to highlight it; leave the ordinary ex cards untouched (untouched = normal
          ex). Work through one set at a time. Saved in this browser only — export the file when
          you're done so the model can pick it up.
        </p>
        <div className="admin-toolbar">
          <span className="admin-progress">{totalTera} tagged Tera</span>
          <button type="button" onClick={handleExport}>
            Export tags (JSON)
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import tags
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      {!candidates && <p className="muted">Loading ex cards…</p>}

      {candidates && (
        <>
          <div className="tera-set-tabs">
            {sets.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === activeSet ? 'tera-set-tab active' : 'tera-set-tab'}
                onClick={() => setActiveSet(s.id)}
              >
                {s.name}
                <span className="muted">
                  {' '}
                  {s.tera}/{s.total}
                </span>
              </button>
            ))}
          </div>

          <div className="rating-grid">
            {shown.map((c) => {
              const thumb = cardThumb(c)
              const isTera = !!tags[c.id]
              return (
                <button
                  key={c.id}
                  type="button"
                  className={isTera ? 'tera-card active' : 'tera-card'}
                  onClick={() => toggle(c.id)}
                  aria-pressed={isTera}
                >
                  {thumb ? (
                    <RetryImage
                      src={thumb}
                      alt={c.name}
                      loading="lazy"
                      placeholder={<div className="rating-card-placeholder" />}
                    />
                  ) : (
                    <div className="rating-card-placeholder" />
                  )}
                  {isTera && <span className="tera-badge">TERA</span>}
                  <span className="tera-card-name">
                    {c.name} <span className="muted">#{c.localId}</span>
                  </span>
                  <span className="muted">
                    {c.rarity ?? 'rarity ?'} · {c.market != null ? formatEuro(c.market) : 'no price'}
                  </span>
                </button>
              )
            })}
          </div>
          {shown.length === 0 && <p className="muted">No ex cards in this set.</p>}
        </>
      )}
    </div>
  )
}
