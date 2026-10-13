// The Tender List keeps its search, filters and page in the URL (frontend-spec §4.1),
// using the same values as the API, e.g. /?q=jammer&category=counter_drone&status=all.

import type { TenderListParams } from '../api/tenders'
import type { BuyerType, Category, DocumentType, OpenStatus } from '../api/types'

export const CATEGORIES: readonly Category[] = ['drone', 'counter_drone']
export const DOCUMENT_TYPES: readonly DocumentType[] = ['RFI', 'RFP']
export const BUYER_TYPES: readonly BuyerType[] = ['central', 'state']
export const OPEN_STATUSES: readonly OpenStatus[] = ['open', 'closed', 'all']

export const DEFAULT_STATUS: OpenStatus = 'open'

function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | undefined {
  return allowed.find((v) => v === value)
}

/** Reads the list's state from the URL. Unknown or malformed values fall back to the defaults. */
export function parseListParams(search: URLSearchParams): TenderListParams {
  const page = Number(search.get('page'))
  const q = search.get('q')?.trim()
  return {
    q: q || undefined,
    category: oneOf(CATEGORIES, search.get('category')),
    document_type: oneOf(DOCUMENT_TYPES, search.get('document_type')),
    buyer_type: oneOf(BUYER_TYPES, search.get('buyer_type')),
    status: oneOf(OPEN_STATUSES, search.get('status')) ?? DEFAULT_STATUS,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  }
}

/** Writes the list's state to the URL, leaving out defaults so "/" means open tenders, page 1. */
export function toSearchParams(params: TenderListParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.category) search.set('category', params.category)
  if (params.document_type) search.set('document_type', params.document_type)
  if (params.buyer_type) search.set('buyer_type', params.buyer_type)
  if (params.status !== DEFAULT_STATUS) search.set('status', params.status)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

/** True when the visitor has narrowed the list (search or any filter other than the default). */
export function hasActiveFilters(params: TenderListParams): boolean {
  return Boolean(
    params.q || params.category || params.document_type || params.buyer_type || params.status !== DEFAULT_STATUS,
  )
}
