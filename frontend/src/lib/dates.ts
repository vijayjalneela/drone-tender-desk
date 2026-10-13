// Calendar dates arrive as YYYY-MM-DD strings and are handled as plain dates,
// never as Date objects in the browser's own time zone, so a date never shifts by a day.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export const CLOSING_SOON_DAYS = 7

function parts(iso: string): [number, number, number] | null {
  const match = ISO_DATE.exec(iso)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return [year, month, day]
}

/** "2026-11-14" → "14 Nov 2026" (frontend-spec §7: the month is always a word). */
export function formatDate(iso: string): string {
  const p = parts(iso)
  if (!p) return iso
  const [year, month, day] = p
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/** Today's date in India (Asia/Kolkata) as YYYY-MM-DD, the same "today" the backend uses. */
export function todayInIndia(now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Whole days from one YYYY-MM-DD date to another (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parts(from)
  const b = parts(to)
  if (!a || !b) return NaN
  const ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])
  return Math.round(ms / 86_400_000)
}

/**
 * "Closing soon": an open tender closing within the next 7 days, today included.
 * Open/Closed itself always comes from the backend's `is_closed`.
 */
export function isClosingSoon(
  closingDate: string | null,
  isClosed: boolean,
  today: string = todayInIndia(),
): boolean {
  if (isClosed || !closingDate) return false
  const days = daysBetween(today, closingDate)
  return days >= 0 && days <= CLOSING_SOON_DAYS
}
