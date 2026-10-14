import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { ADMIN_PAGE_SIZE, fetchAdminTenders, publishTender, unpublishTender } from '../../api/admin'
import type { TenderAdmin } from '../../api/types'
import { useAuth } from '../../auth/useAuth'
import { AdminStateBadge } from '../../components/AdminStateBadge'
import { EmptyState, ErrorState, Loading } from '../../components/States'
import { formatDate } from '../../lib/dates'
import { actionErrorMessage, PUBLISH_CONFIRM, UNPUBLISH_CONFIRM } from '../../lib/adminTender'

export function DashboardPage() {
  const { call } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [actionError, setActionError] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['admin', 'tenders', page],
    queryFn: ({ signal }) => call((token) => fetchAdminTenders(token, { page }, signal)),
    placeholderData: keepPreviousData,
  })

  const action = useMutation({
    mutationFn: ({ id, kind }: { id: number; kind: 'publish' | 'unpublish' }) =>
      call((token) => (kind === 'publish' ? publishTender(token, id) : unpublishTender(token, id))),
    onMutate: () => setActionError(null),
    onError: (error) => setActionError(actionErrorMessage(error)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['tenders'] })
    },
  })

  function run(tender: TenderAdmin, kind: 'publish' | 'unpublish') {
    if (window.confirm(kind === 'publish' ? PUBLISH_CONFIRM : UNPUBLISH_CONFIRM)) {
      action.mutate({ id: tender.id, kind })
    }
  }

  let content
  if (list.isPending) {
    content = <Loading label="Loading tenders…" />
  } else if (list.isError) {
    content = <ErrorState message="Could not load tenders. Please try again." onRetry={() => list.refetch()} />
  } else if (list.data.total === 0) {
    content = <EmptyState>No tenders yet. Add the first one.</EmptyState>
  } else {
    const lastPage = Math.max(1, Math.ceil(list.data.total / ADMIN_PAGE_SIZE))
    content = (
      <>
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Issuing body</th>
                <th className="px-3 py-2 font-medium">Closing date</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {list.data.items.map((tender) => {
                return (
                  <tr key={tender.id}>
                    <td className="px-3 py-2">{tender.title ?? <span className="italic text-slate-500">Untitled</span>}</td>
                    <td className="px-3 py-2">{tender.issuing_body ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {tender.bid_closing_date ? formatDate(tender.bid_closing_date) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <AdminStateBadge tender={tender} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex gap-2">
                        <Link
                          to={`/admin/tenders/${tender.id}/review`}
                          className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                          aria-label={`Review or edit ${tender.title ?? `tender ${tender.id}`}`}
                        >
                          Review/Edit
                        </Link>
                        {tender.status === 'draft' ? (
                          <button
                            type="button"
                            disabled={action.isPending}
                            onClick={() => run(tender, 'publish')}
                            className="rounded bg-green-700 px-2 py-1 text-white hover:bg-green-800 disabled:opacity-50"
                            aria-label={`Publish ${tender.title ?? `tender ${tender.id}`}`}
                          >
                            Publish
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={action.isPending}
                            onClick={() => run(tender, 'unpublish')}
                            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-50"
                            aria-label={`Unpublish ${tender.title ?? `tender ${tender.id}`}`}
                          >
                            Unpublish
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {lastPage > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
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
              onClick={() => setPage(page + 1)}
              className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-navy-900">Admin dashboard</h1>
        <Link
          to="/admin/tenders/new"
          className="btn-primary px-4 py-2 text-sm"
        >
          Add tender
        </Link>
      </div>
      {actionError && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {actionError}
        </p>
      )}
      {content}
    </div>
  )
}
