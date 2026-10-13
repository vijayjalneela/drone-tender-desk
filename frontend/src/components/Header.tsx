import { useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, useNavigate } from 'react-router'

import { useAuth } from '../auth/useAuth'

export const SITE_NAME = 'Drone Tender Desk'

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'font-medium text-slate-900' : 'text-slate-600 hover:text-slate-900'
}

export function Header() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function onLogout() {
    // Leave the admin area first, and wait for it: navigation completes
    // asynchronously, and if the token went first the admin guard would
    // redirect to the login page instead of the public list.
    await navigate('/')
    logout()
    queryClient.removeQueries({ queryKey: ['admin'] })
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-900">
          {SITE_NAME}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4 text-sm">
          <NavLink to="/" end className={navClass}>
            Tenders
          </NavLink>
          {/* Hiding these is only a convenience; the backend checks every admin request. */}
          {token && (
            <>
              <NavLink to="/admin" end className={navClass}>
                Admin dashboard
              </NavLink>
              <button type="button" onClick={onLogout} className="text-slate-600 hover:text-slate-900">
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
