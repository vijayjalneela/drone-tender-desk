import { useCallback, useMemo, useState, type ReactNode } from 'react'

import * as adminApi from '../api/admin'
import { ApiError } from '../api/client'
import { AuthContext, SESSION_EXPIRED_MESSAGE, type AuthState } from './context'
import { clearSession, isExpired, loadSession, saveSession, type Session } from './session'

function initialSession(): { session: Session | null; notice: string | null } {
  const stored = loadSession()
  if (stored && isExpired(stored)) {
    clearSession()
    return { session: null, notice: SESSION_EXPIRED_MESSAGE }
  }
  return { session: stored, notice: null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialSession)

  const expire = useCallback(() => {
    clearSession()
    setState({ session: null, notice: SESSION_EXPIRED_MESSAGE })
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const response = await adminApi.login(username, password)
    const session = { token: response.access_token, expiresAt: response.expires_at }
    saveSession(session)
    setState({ session, notice: null })
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setState({ session: null, notice: null })
  }, [])

  const token = state.session?.token ?? null

  const call = useCallback(
    async <T,>(request: (token: string) => Promise<T>): Promise<T> => {
      if (!token) {
        expire()
        throw new ApiError(401, 'unauthorized', SESSION_EXPIRED_MESSAGE)
      }
      try {
        return await request(token)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) expire()
        throw error
      }
    },
    [token, expire],
  )

  const value = useMemo<AuthState>(
    () => ({ token, notice: state.notice, login, logout, call }),
    [token, state.notice, login, logout, call],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
