import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { apiError, emptyDraft, mockApi, renderApp, signIn } from '../../test/helpers'

const SOURCE = 'https://example.gov.in/tender117.pdf'

function pdfFile(name = 'tender.pdf') {
  return new File(['%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n'], name, { type: 'application/pdf' })
}

async function openPage(handler: Parameters<typeof mockApi>[0] = () => ({ status: 201, body: emptyDraft(5) })) {
  signIn()
  const fetchMock = mockApi(handler)
  const app = renderApp('/admin/tenders/new')
  await screen.findByRole('heading', { name: 'Add tender' })
  return { ...app, fetchMock }
}

describe('Add Tender', () => {
  it('keeps Extract disabled until a PDF and a valid source URL are given', async () => {
    const { user } = await openPage()
    const extract = screen.getByRole('button', { name: 'Extract' })

    expect(extract).toBeDisabled()
    await user.upload(screen.getByLabelText(/Tender PDF/), pdfFile())
    expect(extract).toBeDisabled()

    for (const bad of ['not a url', 'ftp://example.gov.in/x.pdf', 'example.gov.in/x.pdf']) {
      await user.clear(screen.getByLabelText(/Source URL/))
      await user.type(screen.getByLabelText(/Source URL/), bad)
      expect(extract).toBeDisabled()
    }

    await user.clear(screen.getByLabelText(/Source URL/))
    await user.type(screen.getByLabelText(/Source URL/), SOURCE)
    expect(extract).toBeEnabled()
  })

  it('refuses a file that is not a PDF, checked by its content, and does not upload it', async () => {
    const { user, fetchMock } = await openPage()

    const renamed = new File(['PK\u0003\u0004 a zip file'], 'renamed.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText(/Tender PDF/), renamed)
    await user.type(screen.getByLabelText(/Source URL/), SOURCE)

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose a PDF file')
    expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads the PDF and source URL, shows the reading message, then opens Review', async () => {
    let finish: () => void = () => {}
    const { user, router, fetchMock } = await openPage((_url, init) => {
      if (init.method === 'POST') return 'never'
      return { body: emptyDraft(5) }
    })
    // Hold the upload open so the "reading" state can be seen, then answer it.
    fetchMock.mockImplementationOnce(
      (_input, _init) =>
        new Promise<Response>((resolve) => {
          finish = () =>
            resolve(new Response(JSON.stringify(emptyDraft(5)), { status: 201, headers: { 'Content-Type': 'application/json' } }))
        }),
    )

    await user.upload(screen.getByLabelText(/Tender PDF/), pdfFile())
    await user.type(screen.getByLabelText(/Source URL/), `  ${SOURCE}  `)
    await user.click(screen.getByRole('button', { name: 'Extract' }))

    expect(await screen.findByText('Reading the document. This can take up to a minute.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled()

    const [input, init] = fetchMock.mock.calls[0]
    expect(String(input)).toBe('http://api.test/api/admin/tenders')
    const form = init!.body as FormData
    expect((form.get('file') as File).name).toBe('tender.pdf')
    expect(form.get('source_url')).toBe(SOURCE)

    finish()
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/tenders/5/review'))
    expect(
      await screen.findByText('Automatic extraction did not work for this document. Please fill in the fields by hand.'),
    ).toBeInTheDocument()
  })

  it('shows the server’s reason when the upload is refused', async () => {
    const { user } = await openPage(() => apiError(413, 'file_too_large', 'The file is larger than 20 MB.'))

    await user.upload(screen.getByLabelText(/Tender PDF/), pdfFile())
    await user.type(screen.getByLabelText(/Source URL/), SOURCE)
    await user.click(screen.getByRole('button', { name: 'Extract' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The file is larger than 20 MB.')
  })
})
