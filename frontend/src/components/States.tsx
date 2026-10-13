import { useEffect, useState, type ReactNode } from 'react'

/** After this long, a load is probably a sleeping free server waking up (frontend-spec §5). */
const SLOW_LOADING_MS = 5000
const SLOW_LOADING_MESSAGE = 'Starting up the server. This can take up to a minute.'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div role="status" className="py-8 text-center text-slate-600">
      <p>{label}</p>
      {slow && <p className="mt-2 text-sm">{SLOW_LOADING_MESSAGE}</p>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-900">
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
      >
        Retry
      </button>
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded border border-slate-200 bg-white p-6 text-center text-slate-700">{children}</div>
}
