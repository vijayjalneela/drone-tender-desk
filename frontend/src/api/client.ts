import type { ErrorEnvelope, FieldProblem } from './types'

/** Any failed request. `status` is 0 when the backend could not be reached at all. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: FieldProblem[]

  constructor(status: number, code: string, message: string, fields: FieldProblem[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export type QueryValue = string | number | null | undefined

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH'
  query?: Record<string, QueryValue>
  json?: unknown
  form?: FormData
  /** Admin token; sent as `Authorization: Bearer <token>`. */
  token?: string | null
  signal?: AbortSignal
}

/** The server address from VITE_API_BASE_URL (no /api suffix), never hardcoded. */
export function apiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL
  if (!base) {
    throw new Error('VITE_API_BASE_URL is not set. Add it to the .env file at the repo root.')
  }
  return base.replace(/\/+$/, '')
}

export function apiUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${apiBaseUrl()}/api${path.startsWith('/') ? path : `/${path}`}`
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  const error = (body as ErrorEnvelope | null)?.error
  return typeof error?.code === 'string' && typeof error?.message === 'string'
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (options.form) {
    body = options.form // the browser sets the multipart boundary itself
  } else if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  }
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let response: Response
  try {
    response = await fetch(apiUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'network_error', 'Could not reach the server.')
  }

  const parsed: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (isErrorEnvelope(parsed)) {
      const { code, message, fields } = parsed.error
      throw new ApiError(response.status, code, message, fields)
    }
    throw new ApiError(response.status, 'server_error', 'Something went wrong. Please try again later.')
  }
  return parsed as T
}
