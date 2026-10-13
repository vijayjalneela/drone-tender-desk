import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'

import { fetchTenders, PAGE_SIZE, type TenderListParams } from '../api/tenders'
import type { Page, TenderSummary } from '../api/types'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { formatDate, todayInIndia } from '../lib/dates'
import { BUYER_TYPE_LABELS, CATEGORY_LABELS, DOCUMENT_TYPE_LABELS, OPEN_STATUS_LABELS } from '../lib/labels'
import {
  BUYER_TYPES,
  CATEGORIES,
  DEFAULT_STATUS,
  DOCUMENT_TYPES,
  hasActiveFilters,
  OPEN_STATUSES,
  parseListParams,
  toSearchParams,
} from '../lib/listParams'

export function TenderListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = parseListParams(searchParams)

  const list = useQuery({
    queryKey: ['tenders', params],
    queryFn: ({ signal }) => fetchTenders(params, signal),
    placeholderData: keepPreviousData,
  })

  // Only asked when a search comes back empty: are there any published tenders at all?
  const anyPublished = useQuery({
    queryKey: ['tenders', 'any-published'],
    queryFn: ({ signal }) => fetchTenders({ status: 'all', page: 1 }, signal, 1),
    enabled: list.data?.total === 0,
  })

  function update(changes: Partial<TenderListParams>) {
    // Any change to search or filters starts again from page 1.
    setSearchParams(toSearchParams({ ...params, page: 1, ...changes }))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Drone and counter-drone tenders</h1>
      <Filters params={params} onChange={update} />
      <Results
        list={list}
        anyPublished={anyPublished}
        params={params}
        onClear={() => setSearchParams(new URLSearchParams())}
        onPage={(page) => setSearchParams(toSearchParams({ ...params, page }))}
      />
    </div>
  )
}

function Results({
  list,
  anyPublished,
  params,
  onClear,
  onPage,
}: {
  list: UseQueryResult<Page<TenderSummary>>
  anyPublished: UseQueryResult<Page<TenderSummary>>
  params: TenderListParams
  onClear: () => void
  onPage: (page: number) => void
}) {
  if (list.isPending) return <Loading label="Loading tenders…" />
  if (list.isError) {
    return <ErrorState message="Could not load tenders. Please try again." onRetry={() => list.refetch()} />
  }

  const { items, total } = list.data
  if (total === 0) {
    if (anyPublished.isPending) return <Loading label="Loading tenders…" />
    if (anyPublished.data?.total === 0) return <EmptyState>No tenders yet.</EmptyState>
    return (
      <EmptyState>
        <p>No tenders match these filters</p>
        {hasActiveFilters(params) && (
          <button
            type="button"
            onClick={onClear}
            className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Clear filters
          </button>
        )}
      </EmptyState>
    )
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const today = todayInIndia()
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {total} {total === 1 ? 'tender' : 'tenders'}
      </p>
      {items.length === 0 ? (
        <EmptyState>No tenders on this page.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {items.map((tender) => (
            <TenderRow key={tender.id} tender={tender} today={today} />
          ))}
        </ul>
      )}
      <Pager page={params.page} lastPage={lastPage} onPage={onPage} />
    </div>
  )
}

function TenderRow({ tender, today }: { tender: TenderSummary; today: string }) {
  const location = useLocation()
  return (
    <li>
      <Link
        to={`/tenders/${tender.id}`}
        // Lets "Back to tenders" return to this exact filtered view.
        state={{ listSearch: location.search }}
        className="block px-4 py-3 hover:bg-slate-50 focus:bg-slate-50"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="font-medium text-blue-800">{tender.title ?? 'Untitled tender'}</span>
          <StatusBadge isClosed={tender.is_closed} closingDate={tender.bid_closing_date} today={today} />
        </div>
        <div className="mt-1 text-sm text-slate-700">{tender.issuing_body}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          {tender.document_type && <span>{DOCUMENT_TYPE_LABELS[tender.document_type]}</span>}
          {tender.category && <span>{CATEGORY_LABELS[tender.category]}</span>}
          {tender.buyer_type && (
            <span>
              {BUYER_TYPE_LABELS[tender.buyer_type]}
              {tender.buyer_type === 'state' && tender.state_name ? ` · ${tender.state_name}` : ''}
            </span>
          )}
          {tender.bid_closing_date && <span>Closes {formatDate(tender.bid_closing_date)}</span>}
        </div>
      </Link>
    </li>
  )
}

function Filters({
  params,
  onChange,
}: {
  params: TenderListParams
  onChange: (changes: Partial<TenderListParams>) => void
}) {
  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim()
    onChange({ q: q || undefined })
  }

  return (
    <div className="space-y-3 rounded border border-slate-200 bg-white p-4">
      {/* key: the box shows the URL's search again after "Clear filters" or Back */}
      <form role="search" onSubmit={onSearch} className="flex gap-2" key={params.q ?? ''}>
        <label htmlFor="tender-search" className="sr-only">
          Search tenders
        </label>
        <input
          id="tender-search"
          name="q"
          type="search"
          defaultValue={params.q ?? ''}
          placeholder="Search, e.g. jammer or radar"
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5"
        />
        <button type="submit" className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white">
          Search
        </button>
      </form>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select
          label="Category"
          value={params.category}
          options={CATEGORIES}
          labels={CATEGORY_LABELS}
          onChange={(category) => onChange({ category })}
        />
        <Select
          label="Document type"
          value={params.document_type}
          options={DOCUMENT_TYPES}
          labels={DOCUMENT_TYPE_LABELS}
          onChange={(document_type) => onChange({ document_type })}
        />
        <Select
          label="Buyer type"
          value={params.buyer_type}
          options={BUYER_TYPES}
          labels={BUYER_TYPE_LABELS}
          onChange={(buyer_type) => onChange({ buyer_type })}
        />
        <Select
          label="Status"
          value={params.status}
          options={OPEN_STATUSES}
          labels={OPEN_STATUS_LABELS}
          withAll={false}
          onChange={(status) => onChange({ status: status ?? DEFAULT_STATUS })}
        />
      </div>
    </div>
  )
}

function Select<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  withAll = true,
}: {
  label: string
  value: T | undefined
  options: readonly T[]
  labels: Record<T, string>
  onChange: (value: T | undefined) => void
  withAll?: boolean
}) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="text-slate-600">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange((options.find((o) => o === e.target.value) as T | undefined) ?? undefined)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5"
      >
        {withAll && <option value="">All</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </div>
  )
}

function Pager({ page, lastPage, onPage }: { page: number; lastPage: number; onPage: (page: number) => void }) {
  if (lastPage <= 1 && page <= 1) return null
  return (
    <nav aria-label="Pages" className="flex items-center justify-between text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40"
      >
        Previous
      </button>
      <span>
        Page {page} of {lastPage}
      </span>
      <button
        type="button"
        disabled={page >= lastPage}
        onClick={() => onPage(page + 1)}
        className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  )
}
