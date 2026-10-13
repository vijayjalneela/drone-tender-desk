import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { ApiError } from '../../api/client'
import type { LoginRedirectState } from '../../auth/RequireAdmin'
import { useAuth } from '../../auth/useAuth'

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Incorrect username or password.'
    if (error.status === 0) return 'Could not reach the server. Please try again.'
    if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.'
  }
  return 'Something went wrong. Please try again.'
}

export function LoginPage() {
  const { token, notice, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LoginRedirectState | null)?.from ?? '/admin'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (token && !submitting) return <Navigate to={from} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(loginErrorMessage(err))
      setPassword('') // keep the username, clear the password
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Admin login</h1>
      {notice && !error && (
        <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {notice}
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-3 rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-sm text-slate-600">
            Username
          </label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm text-slate-600">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded border border-slate-300 px-3 py-1.5"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Log in
        </button>
      </form>
    </div>
  )
}
