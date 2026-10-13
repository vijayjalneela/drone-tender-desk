// The admin token lives in the browser (frontend-spec §8) together with its expiry time.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded:
// without it the admin simply has to log in again after a reload.

const KEY = 'drone-tender-desk.admin-session'

export interface Session {
  token: string
  expiresAt: string
}

export function isExpired(session: Session, now: number = Date.now()): boolean {
  const expiry = Date.parse(session.expiresAt)
  return Number.isNaN(expiry) || expiry <= now
}

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'string') return null
    return { token: parsed.token, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Not fatal: the session still works until the page is reloaded.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing stored, or storage unavailable.
  }
}
