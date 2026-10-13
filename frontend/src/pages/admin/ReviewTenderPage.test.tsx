import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { TenderAdmin } from '../../api/types'
import { adminTender, apiError, emptyDraft, mockApi, renderApp, signIn } from '../../test/helpers'

const REQUIRED_LABELS = ['Title', 'Issuing body', 'Buyer type', 'Document type', 'Category', 'Bid closing date']

function openReview(tender: TenderAdmin, handler?: Parameters<typeof mockApi>[0]) {
  signIn()
  const fetchMock = mockApi(handler ?? (() => ({ body: tender })))
  const app = renderApp(`/admin/tenders/${tender.id}/review`)
  return { ...app, fetchMock }
}

function hint(label: string) {
  return document.getElementById(`${screen.getByLabelText(label).id}-hint`)!
}

async function fillRequired(user: ReturnType<typeof openReview>['user']) {
  await user.type(screen.getByLabelText('Title'), 'Procurement of Counter Drone Systems')
  await user.type(screen.getByLabelText('Issuing body'), 'Border Security Force')
  await user.selectOptions(screen.getByLabelText('Buyer type'), 'Central')
  await user.selectOptions(screen.getByLabelText('Document type'), 'RFP')
  await user.selectOptions(screen.getByLabelText('Category'), 'Counter-drone')
  await user.type(screen.getByLabelText('Bid closing date'), '2026-11-14')
}

describe('Review Tender: an empty draft from the stub extractor', () => {
  it('says extraction did not work and marks every empty field "Not found in document."', async () => {
    openReview(emptyDraft())

    expect(
      await screen.findByText('Automatic extraction did not work for this document. Please fill in the fields by hand.'),
    ).toBeInTheDocument()
    for (const label of ['Title', 'Reference number', 'Earnest money deposit (EMD)', 'Bid closing date']) {
      expect(hint(label)).toHaveTextContent('Not found in document.')
    }
    expect(screen.getByLabelText('Source URL')).toHaveValue('https://example.gov.in/tender117.pdf')
  })

  it('highlights empty required fields and keeps Publish disabled until they are filled', async () => {
    const { user } = openReview(emptyDraft())
    await screen.findByLabelText('Title')

    for (const label of REQUIRED_LABELS) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
      expect(hint(label)).toHaveTextContent('Required to publish.')
    }
    expect(screen.getByLabelText('Reference number')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()

    await fillRequired(user)

    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
    expect(hint('Title')).not.toHaveTextContent('Not found in document.')
    expect(screen.getByLabelText('Title')).not.toHaveAttribute('aria-invalid')
  })

  it('asks for the state only for a State buyer, and then requires it', async () => {
    const { user } = openReview(emptyDraft())
    await screen.findByLabelText('Title')

    expect(screen.queryByLabelText('State')).not.toBeInTheDocument()
    await fillRequired(user)
    await user.selectOptions(screen.getByLabelText('Buyer type'), 'State')

    expect(screen.getByLabelText('State')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    await user.type(screen.getByLabelText('State'), 'Punjab')
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
  })
})

describe('Review Tender: saving and publishing', () => {
  it('Save draft sends every field, with empty ones as null', async () => {
    const draft = emptyDraft()
    const { user, fetchMock } = openReview(draft, (_url, init) =>
      init.method === 'PATCH' ? { body: { ...draft, title: 'New title' } } : { body: draft },
    )

    await user.type(await screen.findByLabelText('Title'), '  New title  ')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    const body = JSON.parse(patch[1]!.body as string)
    expect(body.title).toBe('New title')
    expect(body.emd).toBeNull()
    expect(body.state_name).toBeNull()
    expect(body.source_url).toBe('https://example.gov.in/tender117.pdf')
    expect(Object.values(body)).not.toContain('')
  })

  it('Publish asks for confirmation, saves what is on screen, then publishes', async () => {
    const draft = emptyDraft()
    const calls: string[] = []
    const { user } = openReview(draft, (url, init) => {
      calls.push(`${init.method ?? 'GET'} ${url.pathname}`)
      if (init.method === 'PATCH') return { body: { ...draft, title: 'x' } }
      if (url.pathname.endsWith('/publish'))
        return { body: adminTender({ id: draft.id, status: 'published', published_at: '2026-10-13T10:00:00+05:30' }) }
      return { body: draft }
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    await screen.findByLabelText('Title')
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    expect(confirm).toHaveBeenCalledWith('Publish this tender? It will be visible to everyone.')
    expect(await screen.findByText('Published. The tender is now on the public list.')).toBeInTheDocument()
    expect(calls).toEqual(['GET /api/admin/tenders/5', 'PATCH /api/admin/tenders/5', 'POST /api/admin/tenders/5/publish'])
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('does not publish when the confirmation is cancelled', async () => {
    const { user, fetchMock } = openReview(emptyDraft())
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    await screen.findByLabelText('Title')
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    expect(fetchMock).toHaveBeenCalledTimes(1) // only the initial load
  })

  it('keeps everything typed on screen when saving fails, and says why', async () => {
    const draft = emptyDraft()
    const { user } = openReview(draft, (_url, init) =>
      init.method === 'PATCH'
        ? apiError(422, 'validation_error', 'Some fields are missing or invalid.', [
            { field: 'bid_closing_date', problem: 'is not a real calendar date' },
          ])
        : { body: draft },
    )

    await user.type(await screen.findByLabelText('Title'), 'Typed title')
    await user.type(screen.getByLabelText('Earnest money deposit (EMD)'), 'Rs 5,00,000')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Some fields are missing or invalid. Check: Bid closing date.')
    expect(hint('Bid closing date')).toHaveTextContent('is not a real calendar date')
    expect(screen.getByLabelText('Title')).toHaveValue('Typed title')
    expect(screen.getByLabelText('Earnest money deposit (EMD)')).toHaveValue('Rs 5,00,000')
  })

  it('keeps everything typed when the server cannot be reached', async () => {
    const draft = emptyDraft()
    const { user } = openReview(draft, (_url, init) => (init.method === 'PATCH' ? 'network-error' : { body: draft }))

    await user.type(await screen.findByLabelText('Title'), 'Typed title')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    expect(screen.getByLabelText('Title')).toHaveValue('Typed title')
  })
})

describe('Review Tender: a published tender', () => {
  it('can be edited and saved, with a note that changes are public at once', async () => {
    const live = adminTender({ status: 'published', extraction_status: 'failed' })
    const { user, fetchMock } = openReview(live, (_url, init) =>
      init.method === 'PATCH' ? { body: { ...live, emd: 'Rs 9,00,000' } } : { body: live },
    )

    const emd = await screen.findByLabelText('Earnest money deposit (EMD)')
    expect(screen.getByText('This tender is published. Saved changes are visible to the public immediately.')).toBeInTheDocument()
    expect(
      screen.queryByText('Automatic extraction did not work for this document. Please fill in the fields by hand.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()

    await user.clear(emd)
    await user.type(emd, 'Rs 9,00,000')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true)
    expect(screen.getByLabelText('Earnest money deposit (EMD)')).toHaveValue('Rs 9,00,000')
  })
})

describe('Review Tender: not found', () => {
  it('shows "Tender not found" for an unknown id', async () => {
    signIn()
    mockApi(() => apiError(404, 'not_found', 'Tender not found.'))

    renderApp('/admin/tenders/99/review')

    const message = await screen.findByText('Tender not found')
    expect(within(message.parentElement!).getByText('Tender not found')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: '← Back to dashboard' })).toHaveAttribute('href', '/admin'))
  })
})
