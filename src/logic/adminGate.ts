/**
 * Client-side gate for the /admin area. This is OBFUSCATION, not security: the
 * admin code and this check both ship to every browser, so a determined person
 * can bypass it. That is acceptable here on purpose — the admin pages only edit
 * this browser's localStorage and export JSON files; they perform no
 * server-side action and expose no private data, so there is nothing a bypass
 * could actually reach. The gate exists to keep casual visitors out of an
 * editing UI that would only confuse them, and to keep the admin area off the
 * public site. Real protection would need server-side auth, which would be
 * disproportionate for local notes.
 *
 * The password itself is never stored — only the SHA-256 of it, in
 * src/data/admin-gate.json. To change it, replace that hash.
 */
import { useSyncExternalStore } from 'react'
import gate from '../data/admin-gate.json'

const UNLOCK_KEY = 'pokevalue-admin-unlocked-v1'
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

export function isAdminUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Returns true and unlocks if the password matches; false otherwise. */
export async function unlockAdmin(password: string): Promise<boolean> {
  const hash = await sha256Hex(password)
  if (hash !== (gate as { sha256: string }).sha256) return false
  try {
    localStorage.setItem(UNLOCK_KEY, '1')
  } catch {
    // localStorage unavailable — unlock lasts for this page only
  }
  notify()
  return true
}

export function lockAdmin(): void {
  try {
    localStorage.removeItem(UNLOCK_KEY)
  } catch {
    // ignore
  }
  notify()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** React hook: re-renders when the admin lock/unlock state changes. */
export function useAdminUnlocked(): boolean {
  return useSyncExternalStore(subscribe, isAdminUnlocked, () => false)
}
