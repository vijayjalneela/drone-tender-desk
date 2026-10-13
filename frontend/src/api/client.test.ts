import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiRequest, apiUrl } from './client'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('apiUrl', () => {
  it('adds /api to the base address', () => {
    expect(apiUrl('/tenders')).toBe('http://api.test/api/tenders')
  })

  it('tolerates a trailing slash on the base address', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/')
    expect(apiUrl('/tenders')).toBe('http://api.test/api/tenders')
  })

  it('drops empty query values and encodes the rest', () => {
    expect(apiUrl('/tenders', { q: 'counter drone', category: '', page: 2, buyer_type: undefined })).toBe(
      'http://api.test/api/tenders?q=counter+drone&page=2',
    )
  })

  it('refuses to guess an address when VITE_API_BASE_URL is missing', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(() => apiUrl('/tenders')).toThrow(/VITE_API_BASE_URL/)
  })
})

describe('apiRequest', () => {
  it('returns the parsed JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'ok' }))

    await expect(apiRequest('/health')).resolves.toEqual({ status: 'ok' })
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/health', expect.objectContaining({ method: 'GET' }))
  })

  it('sends the admin token as a bearer header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await apiRequest('/admin/tenders', { token: 'abc' })

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc')
  })

  it('sends no Authorization header without a token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await apiRequest('/tenders')

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  })

  it('sends JSON bodies with a JSON content type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await apiRequest('/admin/tenders/1', { method: 'PATCH', json: { emd: null } })

    const init = fetchMock.mock.calls[0][1]
    expect(init.method).toBe('PATCH')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"emd":null}')
  })

  it('leaves the content type to the browser for uploads', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, {}))
    const form = new FormData()
    form.set('source_url', 'https://example.gov.in/t.pdf')

    await apiRequest('/admin/tenders', { method: 'POST', form })

    const init = fetchMock.mock.calls[0][1]
    expect(init.body).toBe(form)
    expect(init.headers).not.toHaveProperty('Content-Type')
  })

  it('turns the error envelope into an ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        error: {
          code: 'validation_error',
          message: 'Some fields are missing or invalid.',
          fields: [{ field: 'title', problem: 'required to publish' }],
        },
      }),
    )

    const error = await apiRequest('/admin/tenders/1/publish', { method: 'POST' }).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Some fields are missing or invalid.',
      fields: [{ field: 'title', problem: 'required to publish' }],
    })
  })

  it('has an empty field list when the envelope has none', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: { code: 'not_found', message: 'Tender not found.' } }))

    const error = await apiRequest('/tenders/9').catch((e) => e)

    expect(error).toMatchObject({ status: 404, code: 'not_found', fields: [] })
  })

  it('handles an error that is not in the envelope, e.g. from a proxy', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))

    const error = await apiRequest('/tenders').catch((e) => e)

    expect(error).toMatchObject({ status: 502, code: 'server_error' })
  })

  it('treats a successful response that is not JSON as an error, not as empty data', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Service waking up</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )

    const error = await apiRequest('/tenders').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 200, code: 'server_error' })
  })

  it('reports an unreachable backend as status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await apiRequest('/tenders').catch((e) => e)

    expect(error).toMatchObject({ status: 0, code: 'network_error', message: 'Could not reach the server.' })
  })

  it('lets a cancelled request stay a cancellation', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))

    const error = await apiRequest('/tenders').catch((e) => e)

    expect(error).toBeInstanceOf(DOMException)
  })
})
