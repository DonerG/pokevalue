import { lockAdmin, useAdminUnlocked } from '../logic/adminGate'
import { exportAllAdminData } from '../logic/adminExport'

/**
 * A slim strip shown on every page while the admin area is unlocked — so the
 * hub, the one-file export and the lock are reachable from anywhere, including
 * a normal card page in edit mode. Also the one visible sign that this browser
 * is in admin mode (nobody else sees it — it's gated on the unlock flag).
 */
export function AdminBar() {
  const unlocked = useAdminUnlocked()
  if (!unlocked) return null

  return (
    <div className="admin-bar">
      <span className="admin-bar-label">✎ Admin mode</span>
      <a href="/admin">Hub</a>
      <button type="button" onClick={exportAllAdminData}>
        Export all
      </button>
      <button type="button" onClick={lockAdmin}>
        Lock
      </button>
      <span className="admin-bar-hint">Only you see this — visitors get the normal site.</span>
    </div>
  )
}
