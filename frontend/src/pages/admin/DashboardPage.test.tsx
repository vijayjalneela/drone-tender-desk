import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { adminTender, apiError, mockApi, page, renderApp, signIn } from '../../test/helpers'

const draft = adminTender({ id: 1, title: 'Draft tender', status: 'draft', bid_closing_date: '2026-11-20' })
const published = adminTender({ id: 2, title: 'Live tender', status: 'published', issuing_body: 'Indian Army' })
const closed = adminTender({ id: 3, title: 'Old tender', status: 'published', is_closed: true })
const emptyDraft = adminTender({ id: 4, title: null, issuing_body: null, bid_closing_date: null })

function row(name: string) {
  return screen.getByRole('cell', { name }).closest('tr') as HTMLElement
}

describe('Admin Dashboard', () => {
  it('lists all tenders with title, issuing body, closing date and state', async () => {
    signIn()
    const fetchMock = mockApi(() => ({ body: page([draft, published, closed, emptyDraft]) }))

    renderApp('/admin')

    await screen.findByRole('cell', { name: 'Draft tender' })
    expect(within(row('Draft tender')).getByText('Draft')).toBeInTheDocument()
    expect(within(row('Draft tender')).getByText('20 Nov 2026')).toBeInTheDocument()
    expect(within(row('Live tender')).getByText('Published')).toBeInTheDocument()
    expect(within(row('Live tender')).getByText('Indian Army')).toBeInTheDocument()
    expect(within(row('Old tender')).getByText('Closed')).toBeInTheDocument()
    expect(within(row('Untitled')).getByText('Draft')).toBeInTheDocument()

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/api/admin/tenders')
    expect(url.searchParams.get('status')).toBe('all')
    expect(url.searchParams.get('status_admin')).toBe('all')
  })

  it('offers Publish on drafts only and Unpublish on published tenders only', async () => {
    signIn()
    mockApi(() => ({ body: page([draft, published, closed]) }))

    renderApp('/admin')

    await screen.findByRole('cell', { name: 'Draft tender' })
    expect(within(row('Draft tender')).getByRole('button', { name: /^Publish/ })).toBeInTheDocument()
    expect(within(row('Draft tender')).queryByRole('button', { name: /^Unpublish/ })).not.toBeInTheDocument()
    expect(within(row('Live tender')).getByRole('button', { name: /^Unpublish/ })).toBeInTheDocument()
    expect(within(row('Live tender')).queryByRole('button', { name: /^Publish/ })).not.toBeInTheDocument()
    expect(within(row('Old tender')).getByRole('button', { name: /^Unpublish/ })).toBeInTheDocument()
    expect(within(row('Draft tender')).getByRole('link', { name: /Review or edit/ })).toHaveAttribute(
      'href',
      '/admin/tenders/1/review',
    )
  })

  it('links to Add tender', async () => {
    signIn()
    mockApi(() => ({ body: page([]) }))

    renderApp('/admin')

    expect(await screen.findByRole('link', { name: 'Add tender' })).toHaveAttribute('href', '/admin/tenders/new')
  })

  it('publishes after confirmation and refreshes the list', async () => {
    signIn()
    let isPublished = false
    const fetchMock = mockApi((url, init) => {
      if (init.method === 'POST' && url.pathname === '/api/admin/tenders/1/publish') {
        isPublished = true
        return { body: { ...draft, status: 'published' } }
      }
      return { body: page([isPublished ? { ...draft, status: 'published' } : draft]) }
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp('/admin')

    await user.click(await screen.findByRole('button', { name: 'Publish Draft tender' }))

    expect(confirm).toHaveBeenCalledWith('Publish this tender? It will be visible to everyone.')
    await waitFor(() => expect(within(row('Draft tender')).getByText('Published')).toBeInTheDocument())
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true)
  })

  it('does nothing when publishing is not confirmed', async () => {
    signIn()
    const fetchMock = mockApi(() => ({ body: page([draft]) }))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = renderApp('/admin')

    await user.click(await screen.findByRole('button', { name: 'Publish Draft tender' }))

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('unpublishes after its own confirmation', async () => {
    signIn()
    const fetchMock = mockApi((_url, init) =>
      init.method === 'POST' ? { body: { ...published, status: 'draft' } } : { body: page([published]) },
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp('/admin')

    await user.click(await screen.findByRole('button', { name: 'Unpublish Live tender' }))

    expect(confirm).toHaveBeenCalledWith('Unpublish this tender? It will be hidden from the public list.')
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => init?.method === 'POST' && String(input).endsWith('/api/admin/tenders/2/unpublish'),
        ),
      ).toBe(true),
    )
  })

  it('explains which fields are missing when a draft cannot be published', async () => {
    signIn()
    mockApi((_url, init) =>
      init.method === 'POST'
        ? apiError(422, 'validation_error', 'Fill in the required fields before publishing.', [
            { field: 'title', problem: 'required to publish' },
            { field: 'bid_closing_date', problem: 'required to publish' },
          ])
        : { body: page([draft]) },
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp('/admin')

    await user.click(await screen.findByRole('button', { name: 'Publish Draft tender' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fill in the required fields before publishing. Check: Title, Bid closing date.',
    )
  })

  it('shows an error with Retry when the list cannot be loaded', async () => {
    signIn()
    let fail = true
    mockApi(() => (fail ? 'network-error' : { body: page([draft]) }))
    const { user } = renderApp('/admin')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tenders. Please try again.')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('cell', { name: 'Draft tender' })).toBeInTheDocument()
  })
})
