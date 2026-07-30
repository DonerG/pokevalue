import { useState } from 'react'
import { isAdminUnlocked, lockAdmin, unlockAdmin, useAdminUnlocked } from '../logic/adminGate'
import { exportAllAdminData } from '../logic/adminExport'

function UnlockForm() {
  const [pw, setPw] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await unlockAdmin(pw)
    setBusy(false)
    if (!ok) {
      setError(true)
      setPw('')
    }
  }

  return (
    <div className="admin-hub admin-unlock">
      <h2>Admin</h2>
      <p className="muted">Enter the admin password to edit cards, tags and prices.</p>
      <form onSubmit={submit} className="admin-unlock-form">
        <input
          type="password"
          value={pw}
          autoFocus
          placeholder="Password"
          onChange={(e) => {
            setPw(e.target.value)
            setError(false)
          }}
        />
        <button type="submit" disabled={busy || !pw}>
          Unlock
        </button>
      </form>
      {error && <p className="admin-unlock-error">Wrong password.</p>}
    </div>
  )
}

const TOOLS = [
  { href: '/admin/tera', title: 'Tera ex tagging', desc: 'Mark which Scarlet & Violet ex cards are Tera, set by set.' },
  { href: '/admin/artwork', title: 'Artwork rating', desc: 'Rate illustration quality on chase cards (10 / 9 / 8 / worse).' },
  { href: '/admin/price-audit', title: 'Price audit', desc: 'The biggest market-vs-fair gaps, to spot and fix bad Cardmarket prices.' },
]

export function AdminHubPage() {
  // Re-render on lock/unlock. isAdminUnlocked() gives the value for first paint.
  useAdminUnlocked()
  if (!isAdminUnlocked()) return <UnlockForm />

  return (
    <div className="admin-hub">
      <header className="admin-header">
        <h2>Admin</h2>
        <p className="muted">
          Everything in one place. Edit any card straight from its normal page — the site looks the
          same, but with the admin area unlocked each card page gains an <strong>Admin edit</strong>{' '}
          panel for its artwork rating, trend price and price warning. Bulk tools are below. When
          you're done, <strong>Export all</strong> gives you one file to send back.
        </p>
        <div className="admin-toolbar">
          <button type="button" onClick={exportAllAdminData}>
            ⬇ Export all (one JSON)
          </button>
          <button type="button" onClick={lockAdmin}>
            Lock
          </button>
        </div>
      </header>

      <div className="admin-hub-grid">
        <a className="admin-hub-card admin-hub-browse" href="/">
          <strong>Browse &amp; edit cards →</strong>
          <span className="muted">
            The normal site. Open any card to edit it inline.
          </span>
        </a>
        {TOOLS.map((t) => (
          <a key={t.href} className="admin-hub-card" href={t.href}>
            <strong>{t.title} →</strong>
            <span className="muted">{t.desc}</span>
          </a>
        ))}
      </div>

      <p className="muted admin-hub-note">
        All edits are saved in this browser only until you export the file and it's committed. The
        fair prices don't recompute here — they're rebuilt from the model after the export lands.
      </p>
    </div>
  )
}
