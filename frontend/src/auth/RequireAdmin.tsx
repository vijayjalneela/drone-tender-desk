import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuth } from './useAuth'

export interface LoginRedirectState {
  /** Where the admin was going; they return there after logging in. */
  from?: string
}

/** Every /admin page except the login page sits behind this. */
export function RequireAdmin() {
  const { token } = useAuth()
  const location = useLocation()
  if (!token) {
    const from = location.pathname + location.search
    return <Navigate to="/admin/login" replace state={{ from } satisfies LoginRedirectState} />
  }
  return <Outlet />
}
