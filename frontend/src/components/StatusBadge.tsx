import { isClosingSoon, todayInIndia } from '../lib/dates'

interface Props {
  isClosed: boolean
  closingDate: string | null
  today?: string
}

/** Open (green) or Closed (grey), from the backend's is_closed, plus amber "Closing soon" within 7 days. */
export function StatusBadge({ isClosed, closingDate, today = todayInIndia() }: Props) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {isClosed ? (
        <span className="rounded bg-closed-bg px-2 py-0.5 text-xs font-medium text-closed-text">Closed</span>
      ) : (
        <span className="rounded bg-open-bg px-2 py-0.5 text-xs font-medium text-open-text">Open</span>
      )}
      {isClosingSoon(closingDate, isClosed, today) && (
        <span className="rounded bg-soon-bg px-2 py-0.5 text-xs font-medium text-soon-text">Closing soon</span>
      )}
    </span>
  )
}
