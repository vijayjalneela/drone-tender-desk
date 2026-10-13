import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { fetchTender } from '../api/tenders'
import type { TenderDetail } from '../api/types'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { formatDate } from '../lib/dates'
import { BUYER_TYPE_LABELS, CATEGORY_LABELS, DOCUMENT_TYPE_LABELS } from '../lib/labels'

const NOT_STATED = 'Not stated in the document.'

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

export function TenderDetailPage() {
  const { tenderId } = useParams()
  const location = useLocation()
  const id = Number(tenderId)
  const validId = Number.isInteger(id) && id > 0

  // "Back to tenders" returns to the list with the filters the visitor came from.
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? ''
  const backLink = (
    <Link to={{ pathname: '/', search: listSearch }} className="text-sm text-blue-700 underline">
      ← Back to tenders
    </Link>
  )

  const tender = useQuery({
    queryKey: ['tender', id],
    queryFn: ({ signal }) => fetchTender(id, signal),
    enabled: validId,
    // A missing or unpublished tender won't appear by asking again.
    retry: (failures, error) => !isNotFound(error) && failures < 1,
  })

  let content: ReactNode
  if (!validId || isNotFound(tender.error)) {
    content = (
      <EmptyState>
        <p className="font-medium">Tender not found</p>
        <Link to="/" className="mt-2 inline-block text-blue-700 underline">
          Go to the tender list
        </Link>
      </EmptyState>
    )
  } else if (tender.isPending) {
    content = <Loading label="Loading tender…" />
  } else if (tender.isError) {
    content = <ErrorState message="Could not load this tender. Please try again." onRetry={() => tender.refetch()} />
  } else {
    content = <TenderSummaryView tender={tender.data} />
  }

  return (
    <div className="space-y-4">
      {backLink}
      {content}
    </div>
  )
}

function TenderSummaryView({ tender }: { tender: TenderDetail }) {
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{tender.title ?? 'Untitled tender'}</h1>
        <StatusBadge isClosed={tender.is_closed} closingDate={tender.bid_closing_date} />
      </header>

      <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        This is a summary. The original document is authoritative.
      </p>

      <a
        href={tender.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        View original document
      </a>

      <dl className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
        <Field label="Issuing body" value={tender.issuing_body} />
        <Field label="Buyer type" value={tender.buyer_type && BUYER_TYPE_LABELS[tender.buyer_type]} />
        {tender.buyer_type === 'state' && <Field label="State" value={tender.state_name} />}
        <Field label="Reference number" value={tender.reference_number} />
        <Field label="Document type" value={tender.document_type && DOCUMENT_TYPE_LABELS[tender.document_type]} />
        <Field label="Category" value={tender.category && CATEGORY_LABELS[tender.category]} />
        <Field label="Item and quantity" value={tender.item_and_quantity} />
        <Field label="Key technical requirements" value={tender.technical_requirements} />
        <Field label="Eligibility" value={tender.eligibility} />
        <Field label="Earnest money deposit (EMD)" value={tender.emd} />
        <Field label="Publish date" value={tender.publish_date && formatDate(tender.publish_date)} />
        <Field label="Bid closing date" value={tender.bid_closing_date && formatDate(tender.bid_closing_date)} />
        <Field label="Status" value={tender.is_closed ? 'Closed' : 'Open'} />
      </dl>
    </article>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="whitespace-pre-line sm:col-span-2">
        {value ?? <span className="italic text-slate-500">{NOT_STATED}</span>}
      </dd>
    </div>
  )
}
