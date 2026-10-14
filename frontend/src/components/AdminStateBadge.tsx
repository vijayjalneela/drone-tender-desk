import type { TenderAdmin } from '../api/types'
import { adminState } from '../lib/adminTender'

// Admin state badge (frontend-spec §7.1): Published green and Closed grey, the same
// colours as the public badges; Draft is neutral (outlined) so it never looks Closed.
const STYLES = {
  Draft: 'border border-slate-300 bg-white text-slate-700',
  Published: 'bg-open-bg text-open-text',
  Closed: 'bg-closed-bg text-closed-text',
}

export function AdminStateBadge({ tender }: { tender: TenderAdmin }) {
  const state = adminState(tender)
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${STYLES[state]}`}>{state}</span>
}
