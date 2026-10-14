import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { adminTender, detail, mockApi, page, renderApp, signIn } from '../test/helpers'

const FOOTER = 'Independent project. Not an official Government of India website.'

describe('Footer', () => {
  it.each(['/', '/tenders/1', '/admin/login', '/no-such-page'])('appears on %s', async (path) => {
    mockApi((url) => ({ body: url.pathname === '/api/tenders' ? page([]) : detail() }))

    renderApp(path)

    expect(await screen.findByRole('contentinfo')).toHaveTextContent(FOOTER)
  })

  it('appears on admin pages for a logged-in admin', async () => {
    signIn()
    mockApi(() => ({ body: page([adminTender()]) }))

    renderApp('/admin')

    expect(await screen.findByRole('contentinfo')).toHaveTextContent(FOOTER)
  })
})
