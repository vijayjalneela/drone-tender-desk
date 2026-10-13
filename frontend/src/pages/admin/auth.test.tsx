import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { loadSession } from '../../auth/session'
import { adminTender, apiError, mockApi, page, renderApp, requestedUrls, signIn, TEST_TOKEN } from '../../test/helpers'

const LOGIN_OK = {
  body: { access_token: 'fresh-token', token_type: 'bearer', expires_at: '2999-01-01T06:30:00+05:30' },
}

describe('Admin Login', () => {
  it('logs in and opens the dashboard', async () => {
    const fetchMock = mockApi((url) =>
      url.pathname === '/api/admin/login' ? LOGIN_OK : { body: page([adminTender()]) },
    )
    const { router, user } = renderApp('/admin/login')

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
    expect(loadSession()).toEqual({ token: 'fresh-token', expiresAt: '2999-01-01T06:30:00+05:30' })
    const loginCall = fetchMock.mock.calls[0]
    expect(JSON.parse(loginCall[1]!.body as string)).toEqual({
      username: 'admin',
      password: 'correct horse battery',
    })
  })

  it('on wrong credentials shows the message, clears the password and keeps the username', async () => {
    mockApi(() => apiError(401, 'unauthorized', 'Incorrect username or password.'))
    const { router, user } = renderApp('/admin/login')

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Username')).toHaveValue('admin')
    expect(router.state.location.pathname).toBe('/admin/login')
    // A failed login is not an expired session.
    expect(screen.queryByText('Your session has expired. Please log in again.')).not.toBeInTheDocument()
  })

  it('asks the admin to wait after too many attempts (429)', async () => {
    mockApi(() => apiError(429, 'rate_limited', 'Too many requests. Please wait and try again.'))
    const { user } = renderApp('/admin/login')

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Please wait a minute and try again.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('says so when the server cannot be reached', async () => {
    mockApi(() => 'network-error')
    const { user } = renderApp('/admin/login')

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
  })

  it('sends a logged-in admin straight on to the dashboard', async () => {
    signIn()
    mockApi(() => ({ body: page([]) }))
    const { router } = renderApp('/admin/login')

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
  })
})

describe('Admin pages need a login', () => {
  it.each(['/admin', '/admin/tenders/new', '/admin/tenders/5/review'])(
    '%s sends a visitor to the login page without calling any admin API',
    async (path) => {
      const fetchMock = mockApi(() => ({ body: {} }))
      const { router } = renderApp(path)

      await waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'))
      expect(requestedUrls(fetchMock).filter((u) => u.pathname.startsWith('/api/admin'))).toEqual([])
    },
  )

  it('returns to the page that was asked for after logging in', async () => {
    mockApi((url) =>
      url.pathname === '/api/admin/login' ? LOGIN_OK : { body: adminTender({ id: 5, title: 'Asked-for tender' }) },
    )
    const { router, user } = renderApp('/admin/tenders/5/review')

    await screen.findByRole('heading', { name: 'Admin login' })
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/tenders/5/review'))
    expect(await screen.findByLabelText('Title')).toHaveValue('Asked-for tender')
  })

  it('sends the stored token with admin requests', async () => {
    signIn()
    const fetchMock = mockApi(() => ({ body: page([adminTender()]) }))

    renderApp('/admin')

    await screen.findByText('Procurement of Counter Drone Systems')
    const init = fetchMock.mock.calls[0][1]!
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TEST_TOKEN}`)
  })
})

describe('Expired session', () => {
  it('a 401 from an admin request sends the admin to login with the session-expired message', async () => {
    signIn()
    mockApi(() => apiError(401, 'unauthorized', 'Your session has expired. Please log in again.'))
    const { router } = renderApp('/admin')

    expect(await screen.findByText('Your session has expired. Please log in again.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/login')
    expect(loadSession()).toBeNull()
  })

  it('a stored token past its expiry time is dropped before any request', async () => {
    signIn('2020-01-01T00:00:00+05:30')
    const fetchMock = mockApi(() => ({ body: page([]) }))
    const { router } = renderApp('/admin')

    expect(await screen.findByText('Your session has expired. Please log in again.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/login')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('after logging in again the admin returns to where they were', async () => {
    signIn()
    let expired = true
    mockApi((url) => {
      if (url.pathname === '/api/admin/login') {
        expired = false
        return LOGIN_OK
      }
      return expired ? apiError(401, 'unauthorized', 'expired') : { body: adminTender({ id: 9 }) }
    })
    const { router, user } = renderApp('/admin/tenders/9/review')

    await screen.findByText('Your session has expired. Please log in again.')
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/tenders/9/review'))
  })
})
