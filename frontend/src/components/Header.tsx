import { Link, NavLink } from 'react-router'

export const SITE_NAME = 'Drone Tender Desk'

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-900">
          {SITE_NAME}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'font-medium text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }
          >
            Tenders
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
