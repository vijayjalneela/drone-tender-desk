import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'

import { fetchAdminTender, publishTender, updateTender } from '../../api/admin'
import { ApiError } from '../../api/client'
import type { TenderAdmin } from '../../api/types'
import { useAuth } from '../../auth/useAuth'
import { EmptyState, ErrorState, Loading } from '../../components/States'
import {
  FIELDS,
  missingRequired,
  toChanges,
  toFormValues,
  type EditableField,
  type FieldDef,
  type FormValues,
} from '../../lib/tenderFields'
import { actionErrorMessage, adminState, EXTRACTION_FAILED, PUBLISH_CONFIRM } from '../../lib/adminTender'

export function ReviewTenderPage() {
  const { tenderId } = useParams()
  const id = Number(tenderId)
  const validId = Number.isInteger(id) && id > 0
  const { call } = useAuth()

  const tender = useQuery({
    queryKey: ['admin', 'tender', id],
    queryFn: ({ signal }) => call((token) => fetchAdminTender(token, id, signal)),
    enabled: validId,
    retry: false,
    // Don't refetch underneath the admin while they are typing.
    staleTime: Infinity,
  })

  const notFound = !validId || (tender.error instanceof ApiError && tender.error.status === 404)

  return (
    <div className="space-y-4">
      <Link to="/admin" className="text-sm text-navy-700 underline">
        ← Back to dashboard
      </Link>
      {notFound ? (
        <EmptyState>
          <p className="font-medium">Tender not found</p>
        </EmptyState>
      ) : tender.isPending ? (
        <Loading label="Loading tender…" />
      ) : tender.isError ? (
        <ErrorState message="Could not load this tender. Please try again." onRetry={() => tender.refetch()} />
      ) : (
        // key: start the form afresh if a different tender is loaded
        <ReviewForm key={tender.data.id} initial={tender.data} />
      )}
    </div>
  )
}

function ReviewForm({ initial }: { initial: TenderAdmin }) {
  const { call } = useAuth()
  const queryClient = useQueryClient()

  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState<FormValues>(() => toFormValues(initial))
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null)

  const missing = missingRequired(values)
  const isDraft = saved.status === 'draft'

  function onSuccess(tender: TenderAdmin, message: string) {
    setSaved(tender)
    setValues(toFormValues(tender))
    setNotice(message)
    queryClient.setQueryData(['admin', 'tender', tender.id], tender)
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenders'] })
    queryClient.invalidateQueries({ queryKey: ['tenders'] })
    queryClient.invalidateQueries({ queryKey: ['tender'] })
  }

  function onFailure(err: unknown) {
    // The admin's edits stay in `values`; only the message changes.
    const fields = err instanceof ApiError ? Object.fromEntries(err.fields.map((f) => [f.field, f.problem])) : {}
    setError({ message: actionErrorMessage(err), fields })
  }

  const save = useMutation({
    mutationFn: (changes: FormValues) => call((token) => updateTender(token, saved.id, toChanges(changes))),
    onMutate: () => {
      setNotice(null)
      setError(null)
    },
    onSuccess: (tender) => onSuccess(tender, 'Saved.'),
    onError: onFailure,
  })

  const publish = useMutation({
    // Save what is on screen first, so the published tender is exactly what the admin sees.
    mutationFn: async (changes: FormValues) =>
      call(async (token) => {
        await updateTender(token, saved.id, toChanges(changes))
        return publishTender(token, saved.id)
      }),
    onMutate: () => {
      setNotice(null)
      setError(null)
    },
    onSuccess: (tender) => onSuccess(tender, 'Published. The tender is now on the public list.'),
    onError: onFailure,
  })

  const busy = save.isPending || publish.isPending

  function setValue(name: EditableField, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function onSave(event: FormEvent) {
    event.preventDefault()
    save.mutate(values)
  }

  function onPublish() {
    if (window.confirm(PUBLISH_CONFIRM)) publish.mutate(values)
  }

  const visibleFields = FIELDS.filter((f) => f.name !== 'state_name' || values.buyer_type === 'state')

  return (
    <form onSubmit={onSave} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-navy-900">{isDraft ? 'Review tender' : 'Edit tender'}</h1>
        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium">{adminState(saved)}</span>
      </div>

      {saved.extraction_status === 'failed' && isDraft && (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{EXTRACTION_FAILED}</p>
      )}
      {!isDraft && (
        <p className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          This tender is published. Saved changes are visible to the public immediately.
        </p>
      )}

      <div className="space-y-4 rounded border border-slate-200 bg-white p-4">
        {visibleFields.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(value) => setValue(field.name, value)}
            required={missing.includes(field.name)}
            notFound={saved.fields_not_found.includes(field.name) && values[field.name].trim() === ''}
            serverProblem={error?.fields[field.name]}
            disabled={busy}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error.message}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          {notice}
        </p>
      )}
      {isDraft && missing.length > 0 && (
        <p className="text-sm text-slate-600">Fill in the highlighted fields to publish.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="btn-primary px-4 py-2 text-sm"
        >
          {isDraft ? 'Save draft' : 'Save'}
        </button>
        {isDraft && (
          <button
            type="button"
            onClick={onPublish}
            disabled={busy || missing.length > 0}
            className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            Publish
          </button>
        )}
      </div>
    </form>
  )
}

function FieldInput({
  field,
  value,
  onChange,
  required,
  notFound,
  serverProblem,
  disabled,
}: {
  field: FieldDef
  value: string
  onChange: (value: string) => void
  required: boolean
  notFound: boolean
  serverProblem?: string
  disabled: boolean
}) {
  const id = `field-${field.name}`
  const hintId = `${id}-hint`
  const highlighted = required || Boolean(serverProblem)
  const border = highlighted ? 'border-red-500 bg-red-50' : 'border-slate-300'
  const common = {
    id,
    value,
    disabled,
    'aria-invalid': highlighted || undefined,
    'aria-describedby': required || notFound || serverProblem ? hintId : undefined,
    className: `w-full rounded border px-3 py-1.5 ${border}`,
  }

  let input
  if (field.kind === 'select') {
    input = (
      <select {...common} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  } else if (field.kind === 'textarea') {
    input = <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
  } else {
    input = <input {...common} type={field.kind} onChange={(e) => onChange(e.target.value)} />
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {field.label}
      </label>
      {input}
      <div id={hintId} className="flex flex-wrap gap-x-3 text-xs">
        {notFound && <span className="text-amber-800">Not found in document.</span>}
        {required && <span className="text-red-700">Required to publish.</span>}
        {serverProblem && <span className="text-red-700">{serverProblem}</span>}
      </div>
    </div>
  )
}
