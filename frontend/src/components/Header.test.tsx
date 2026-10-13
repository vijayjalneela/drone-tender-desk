import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { loadSession } from '../auth/session'
import { mockApi, page, renderApp, signIn } from '../test/helpers'

describe('Header', () => {
  it('shows the site name and a link to the tender list, and no admin links to a visitor', async () => {
    mockApi(() => ({ body: page([]) }))

    renderApp('/')

    expect(screen.getByRole('link', { name: 'Drone Tender Desk' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Tenders' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'Admin dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()
  })

  it('shows Admin dashboard and Logout to a logged-in admin', async () => {
    signIn()
    mockApi(() => ({ body: page([]) }))

    renderApp('/')

    expect(screen.getByRole('link', { name: 'Admin dashboard' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })

  it('Logout forgets the token and goes to the public tender list', async () => {
    signIn()
    mockApi(() => ({ body: page([]) }))
    const { router, user } = renderApp('/admin')

    await user.click(await screen.findByRole('button', { name: 'Logout' }))

    expect(router.state.location.pathname).toBe('/')
    expect(loadSession()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()
  })
})
