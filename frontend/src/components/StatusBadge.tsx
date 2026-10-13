import { isClosingSoon, todayInIndia } from '../lib/dates'

interface Props {
  isClosed: boolean
  closingDate: string | null
  today?: string
}

/** Open or Closed (from the backend's is_closed), plus "Closing soon" within 7 days. */
export function StatusBadge({ isClosed, closingDate, today = todayInIndia() }: Props) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {isClosed ? (
        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Closed</span>
      ) : (
        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Open</span>
      )}
      {isClosingSoon(closingDate, isClosed, today) && (
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Closing soon</span>
      )}
    </span>
  )
}
