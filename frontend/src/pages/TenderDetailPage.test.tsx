import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { detail, freezeToday, mockApi, page, renderApp, summary } from '../test/helpers'

function field(label: string) {
  const term = screen.getByText(label, { selector: 'dt' })
  return term.nextElementSibling as HTMLElement
}

describe('Tender Detail', () => {
  it('shows a loading indicator while loading', async () => {
    mockApi(() => 'never')

    renderApp('/tenders/1')

    expect(await screen.findByRole('status')).toHaveTextContent('Loading tender…')
  })

  it('shows every field, with dates written out', async () => {
    freezeToday()
    mockApi(() => ({ body: detail({ buyer_type: 'state', state_name: 'Punjab' }) }))

    renderApp('/tenders/1')

    expect(await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })).toBeInTheDocument()
    expect(field('Issuing body')).toHaveTextContent('Border Security Force')
    expect(field('Buyer type')).toHaveTextContent('State')
    expect(field('State')).toHaveTextContent('Punjab')
    expect(field('Reference number')).toHaveTextContent('BSF/PROC/2026/117')
    expect(field('Document type')).toHaveTextContent('RFP')
    expect(field('Category')).toHaveTextContent('Counter-drone')
    expect(field('Item and quantity')).toHaveTextContent('Vehicle-mounted counter-drone system, 12 units')
    expect(field('Key technical requirements')).toHaveTextContent('Detection range at least 3 km')
    expect(field('Eligibility')).toHaveTextContent('Average annual turnover of Rs 10 crore')
    expect(field('Earnest money deposit (EMD)')).toHaveTextContent('Rs 5,00,000')
    expect(field('Publish date')).toHaveTextContent('1 Oct 2026')
    expect(field('Bid closing date')).toHaveTextContent('20 Nov 2026')
    expect(field('Status')).toHaveTextContent('Open')
    expect(screen.getByText('Closing soon')).toBeInTheDocument()
  })

  it('has no State row for a central buyer', async () => {
    mockApi(() => ({ body: detail() }))

    renderApp('/tenders/1')

    await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })
    expect(screen.queryByText('State', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('says "Not stated in the document." for empty fields', async () => {
    mockApi(() => ({ body: detail({ emd: null, eligibility: null, reference_number: null, publish_date: null }) }))

    renderApp('/tenders/1')

    await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })
    for (const label of ['Earnest money deposit (EMD)', 'Eligibility', 'Reference number', 'Publish date']) {
      expect(field(label)).toHaveTextContent('Not stated in the document.')
    }
  })

  it('links to the original document in a new tab', async () => {
    mockApi(() => ({ body: detail() }))

    renderApp('/tenders/1')

    const link = await screen.findByRole('link', { name: 'View original document' })
    expect(link).toHaveAttribute('href', 'https://example.gov.in/tender117.pdf')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('always says the original document is authoritative', async () => {
    mockApi(() => ({ body: detail() }))

    renderApp('/tenders/1')

    expect(
      await screen.findByText('This is a summary. The original document is authoritative.'),
    ).toBeInTheDocument()
  })

  it('shows Closed for a closed tender', async () => {
    mockApi(() => ({ body: detail({ is_closed: true, bid_closing_date: '2026-10-01' }) }))

    renderApp('/tenders/1')

    await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })
    expect(field('Status')).toHaveTextContent('Closed')
  })
})

describe('Tender Detail: not found and errors', () => {
  it('shows "Tender not found" for a 404 and does not ask again', async () => {
    const fetchMock = mockApi(() => ({
      status: 404,
      body: { error: { code: 'not_found', message: 'Tender not found.' } },
    }))

    renderApp('/tenders/99')

    expect(await screen.findByText('Tender not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the tender list' })).toHaveAttribute('href', '/')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows "Tender not found" for an id that is not a number, without asking the server', async () => {
    const fetchMock = mockApi(() => ({ body: detail() }))

    renderApp('/tenders/abc')

    expect(await screen.findByText('Tender not found')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows an error with Retry when the backend fails, and Retry loads the tender', async () => {
    let fail = true
    mockApi(() => (fail ? 'network-error' : { body: detail() }))
    const { user } = renderApp('/tenders/1')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this tender. Please try again.')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })).toBeInTheDocument()
  })
})

describe('Back to tenders', () => {
  it('returns to the list with the previous filters still applied', async () => {
    mockApi((url) => ({
      body: url.pathname === '/api/tenders' ? page([summary({ id: 7 })]) : detail({ id: 7 }),
    }))
    const { router, user } = renderApp('/?q=radar&category=counter_drone&status=all')

    await user.click(await screen.findByText('Procurement of Counter Drone Systems'))
    await screen.findByRole('link', { name: 'View original document' })
    await user.click(screen.getByRole('link', { name: '← Back to tenders' }))

    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toBe('?q=radar&category=counter_drone&status=all')
    const search = await screen.findByRole('searchbox', { name: 'Search tenders' })
    expect(search).toHaveValue('radar')
    expect(within(screen.getByRole('main')).getByLabelText('Category')).toHaveValue('counter_drone')
  })

  it('goes to the plain list when the detail page was opened directly', async () => {
    mockApi(() => ({ body: detail() }))

    renderApp('/tenders/1')

    expect(await screen.findByRole('link', { name: '← Back to tenders' })).toHaveAttribute('href', '/')
  })
})
