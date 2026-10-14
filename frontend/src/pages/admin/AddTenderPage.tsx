import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { createTender } from '../../api/admin'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { isValidHttpUrl } from '../../lib/adminTender'

const MAX_BYTES = 20 * 1024 * 1024
const NOT_A_PDF = 'Please choose a PDF file'

/** Checks the file's content for the PDF header, like the backend does, not just its name. */
async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  return new TextDecoder('latin1').decode(head).includes('%PDF-')
}

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'The file is larger than 20 MB.'
    if (error.status === 0) return 'Could not reach the server. Please try again.'
    if (error.fields.some((f) => f.field === 'file')) return NOT_A_PDF
    if (error.fields.some((f) => f.field === 'source_url')) return 'Please enter a valid http or https address.'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

export function AddTenderPage() {
  const { call } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')

  const upload = useMutation({
    mutationFn: ({ pdf, url }: { pdf: File; url: string }) => call((token) => createTender(token, pdf, url)),
    onSuccess: (tender) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.setQueryData(['admin', 'tender', tender.id], tender)
      navigate(`/admin/tenders/${tender.id}/review`)
    },
  })

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null
    setFile(null)
    setFileError(null)
    if (!chosen) return
    if (chosen.size > MAX_BYTES) {
      setFileError('The file is larger than 20 MB.')
    } else if (!(await looksLikePdf(chosen))) {
      setFileError(NOT_A_PDF)
    } else {
      setFile(chosen)
    }
  }

  const urlValid = isValidHttpUrl(sourceUrl)
  const canExtract = file !== null && urlValid && !upload.isPending

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (file && urlValid) upload.mutate({ pdf: file, url: sourceUrl.trim() })
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold text-navy-900">Add tender</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="pdf" className="text-sm text-slate-600">
            Tender PDF (up to 20 MB)
          </label>
          <input
            id="pdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={onFileChange}
            disabled={upload.isPending}
            className="text-sm"
          />
          {fileError && (
            <p role="alert" className="text-sm text-red-700">
              {fileError}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="source-url" className="text-sm text-slate-600">
            Source URL (where the document is published)
          </label>
          <input
            id="source-url"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={upload.isPending}
            className="rounded border border-slate-300 px-3 py-1.5"
          />
          {sourceUrl.trim() !== '' && !urlValid && (
            <p className="text-sm text-red-700">Please enter a valid http or https address.</p>
          )}
        </div>
        {upload.isError && (
          <p role="alert" className="text-sm text-red-700">
            {uploadErrorMessage(upload.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={!canExtract}
          className="btn-primary px-4 py-2 text-sm"
        >
          Extract
        </button>
        {upload.isPending && (
          <p role="status" className="text-sm text-slate-700">
            Reading the document. This can take up to a minute.
          </p>
        )}
      </form>
    </div>
  )
}
