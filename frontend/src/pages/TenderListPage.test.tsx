import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { freezeToday, mockApi, page, renderApp, requestedUrls, summary } from '../test/helpers'

/** True for the extra "are there any published tenders?" request. */
function isAnyPublishedCheck(url: URL) {
  return url.searchParams.get('page_size') === '1'
}

describe('Tender List: loading and empty states', () => {
  it('shows a loading indicator, not an empty message, while loading', async () => {
    mockApi(() => 'never')

    renderApp('/')

    expect(await screen.findByRole('status')).toHaveTextContent('Loading tenders…')
    expect(screen.queryByText('No tenders yet.')).not.toBeInTheDocument()
  })

  it('says "No tenders yet." when nothing is published at all', async () => {
    mockApi(() => ({ body: page([]) }))

    renderApp('/')

    expect(await screen.findByText('No tenders yet.')).toBeInTheDocument()
  })

  it('says no tenders match, with Clear filters, when filters exclude everything', async () => {
    mockApi((url) => ({ body: isAnyPublishedCheck(url) ? page([summary()], 3) : page([]) }))
    const { router, user } = renderApp('/?q=helicopter&category=drone')

    expect(await screen.findByText('No tenders match these filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(router.state.location.search).toBe('')
  })

  it('has no Clear filters button when the default view is empty but closed tenders exist', async () => {
    mockApi((url) => ({ body: isAnyPublishedCheck(url) ? page([summary()], 1) : page([]) }))

    renderApp('/')

    expect(await screen.findByText('No tenders match these filters')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })
})

describe('Tender List: errors', () => {
  it.each([
    ['a server error', { status: 500, body: { error: { code: 'server_error', message: 'x' } } }],
    ['an unreachable backend', 'network-error' as const],
  ])('shows an error with Retry after %s, and Retry loads the list', async (_, failure) => {
    let fail = true
    mockApi(() => (fail ? failure : { body: page([summary()]) }))
    const { user } = renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tenders. Please try again.')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Procurement of Counter Drone Systems')).toBeInTheDocument()
  })
})

describe('Tender List: rows', () => {
  it('shows every column the spec asks for', async () => {
    freezeToday()
    mockApi(() => ({ body: page([summary({ bid_closing_date: '2026-11-20' })]) }))

    renderApp('/')

    const row = (await screen.findByText('Procurement of Counter Drone Systems')).closest('li')!
    const cells = within(row)
    expect(cells.getByText('Border Security Force')).toBeInTheDocument()
    expect(cells.getByText('RFP')).toBeInTheDocument()
    expect(cells.getByText('Counter-drone')).toBeInTheDocument()
    expect(cells.getByText('Central')).toBeInTheDocument()
    expect(cells.getByText('Closes 20 Nov 2026')).toBeInTheDocument()
    expect(cells.getByText('Open')).toBeInTheDocument()
    expect(cells.getByText('Closing soon')).toBeInTheDocument() // 6 days away
  })

  it('shows Closed for a closed tender, never Closing soon', async () => {
    freezeToday()
    mockApi(() => ({ body: page([summary({ is_closed: true, bid_closing_date: '2026-11-13' })]) }))

    renderApp('/?status=closed')

    const row = (await screen.findByText('Procurement of Counter Drone Systems')).closest('li')!
    expect(within(row).getByText('Closed')).toBeInTheDocument()
    expect(within(row).queryByText('Closing soon')).not.toBeInTheDocument()
  })

  it('shows the state for a state buyer', async () => {
    mockApi(() => ({ body: page([summary({ buyer_type: 'state', state_name: 'Punjab' })]) }))

    renderApp('/')

    expect(await screen.findByText('State · Punjab')).toBeInTheDocument()
  })

  it('opens Tender Detail when a row is clicked', async () => {
    mockApi((url) => ({ body: url.pathname === '/api/tenders' ? page([summary({ id: 7 })]) : {} }))
    const { router, user } = renderApp('/')

    await user.click(await screen.findByText('Procurement of Counter Drone Systems'))

    expect(router.state.location.pathname).toBe('/tenders/7')
  })
})

describe('Tender List: search and filters live in the URL', () => {
  it('asks for open tenders, page 1, by default', async () => {
    const fetchMock = mockApi(() => ({ body: page([summary()]) }))

    renderApp('/')

    await screen.findByText('Procurement of Counter Drone Systems')
    const [url] = requestedUrls(fetchMock)
    expect(url.pathname).toBe('/api/tenders')
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: 'open', page: '1', page_size: '20' })
  })

  it('sends the filters from the URL and shows them in the controls', async () => {
    const fetchMock = mockApi(() => ({ body: page([summary()], 30, 2) }))

    renderApp('/?q=jammer&category=counter_drone&document_type=RFP&buyer_type=central&status=all&page=2')

    await screen.findByText('Procurement of Counter Drone Systems')
    expect(Object.fromEntries(requestedUrls(fetchMock)[0].searchParams)).toEqual({
      q: 'jammer',
      category: 'counter_drone',
      document_type: 'RFP',
      buyer_type: 'central',
      status: 'all',
      page: '2',
      page_size: '20',
    })
    expect(screen.getByRole('searchbox', { name: 'Search tenders' })).toHaveValue('jammer')
    expect(screen.getByLabelText('Category')).toHaveValue('counter_drone')
    expect(screen.getByLabelText('Status')).toHaveValue('all')
  })

  it('ignores unknown values in the URL instead of failing', async () => {
    const fetchMock = mockApi(() => ({ body: page([summary()]) }))

    renderApp('/?category=helicopter&status=everything&page=-3')

    await screen.findByText('Procurement of Counter Drone Systems')
    expect(Object.fromEntries(requestedUrls(fetchMock)[0].searchParams)).toEqual({
      status: 'open',
      page: '1',
      page_size: '20',
    })
  })

  it('changing a filter updates the URL and starts again from page 1', async () => {
    mockApi(() => ({ body: page([summary()], 45, 2) }))
    const { router, user } = renderApp('/?page=2')

    await screen.findByText('Procurement of Counter Drone Systems')
    await user.selectOptions(screen.getByLabelText('Category'), 'drone')

    expect(router.state.location.search).toBe('?category=drone')
  })

  it('choosing All removes the filter from the URL', async () => {
    mockApi(() => ({ body: page([summary()]) }))
    const { router, user } = renderApp('/?category=drone&status=all')

    await screen.findByText('Procurement of Counter Drone Systems')
    await user.selectOptions(screen.getByLabelText('Category'), 'All')

    expect(router.state.location.search).toBe('?status=all')
  })

  it('search and filters work together', async () => {
    const fetchMock = mockApi(() => ({ body: page([summary()]) }))
    const { router, user } = renderApp('/?category=counter_drone')

    await screen.findByText('Procurement of Counter Drone Systems')
    await user.type(screen.getByRole('searchbox', { name: 'Search tenders' }), '  radar  {Enter}')

    expect(router.state.location.search).toBe('?q=radar&category=counter_drone')
    await waitFor(() => {
      const last = requestedUrls(fetchMock).at(-1)!
      expect(last.searchParams.get('q')).toBe('radar')
      expect(last.searchParams.get('category')).toBe('counter_drone')
    })
  })
})

describe('Tender List: pages', () => {
  it('moves between pages with Previous and Next', async () => {
    mockApi(() => ({ body: page([summary()], 45) }))
    const { router, user } = renderApp('/')

    await screen.findByText('Page 1 of 3')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(router.state.location.search).toBe('?page=2')
  })

  it('disables Next on the last page', async () => {
    mockApi(() => ({ body: page([summary()], 45, 3) }))

    renderApp('/?page=3')

    await screen.findByText('Page 3 of 3')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('shows no pager when everything fits on one page', async () => {
    mockApi(() => ({ body: page([summary()], 1) }))

    renderApp('/')

    await screen.findByText('Procurement of Counter Drone Systems')
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })
})
