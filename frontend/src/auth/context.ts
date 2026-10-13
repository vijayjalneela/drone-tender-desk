import { createContext } from 'react'

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.'

export interface AuthState {
  token: string | null
  /** Shown on the login page after the session ends on its own. */
  notice: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  /**
   * Runs an admin request with the current token. A 401 from the backend ends the
   * session, which sends the admin to the login page (see RequireAdmin).
   */
  call: <T>(request: (token: string) => Promise<T>) => Promise<T>
}

export const AuthContext = createContext<AuthState | null>(null)
