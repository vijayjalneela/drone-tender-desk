import { apiRequest } from './client'
import type { LoginResponse, OpenStatus, Page, TenderAdmin, TenderStatus } from './types'

// Editable through PATCH: every extractable field plus source_url (api-contract §4).
export type TenderChanges = Partial<
  Pick<
    TenderAdmin,
    | 'title'
    | 'issuing_body'
    | 'buyer_type'
    | 'state_name'
    | 'reference_number'
    | 'document_type'
    | 'category'
    | 'item_and_quantity'
    | 'technical_requirements'
    | 'eligibility'
    | 'emd'
    | 'publish_date'
    | 'bid_closing_date'
  >
> & { source_url?: string }

export const ADMIN_PAGE_SIZE = 50

export function login(username: string, password: string) {
  return apiRequest<LoginResponse>('/admin/login', { method: 'POST', json: { username, password } })
}

export function fetchAdminTenders(
  token: string,
  options: { page?: number; status?: OpenStatus; status_admin?: TenderStatus | 'all' } = {},
  signal?: AbortSignal,
) {
  return apiRequest<Page<TenderAdmin>>('/admin/tenders', {
    token,
    signal,
    query: { status: 'all', status_admin: 'all', page: 1, page_size: ADMIN_PAGE_SIZE, ...options },
  })
}

export function fetchAdminTender(token: string, id: number, signal?: AbortSignal) {
  return apiRequest<TenderAdmin>(`/admin/tenders/${id}`, { token, signal })
}

export function createTender(token: string, file: File, sourceUrl: string) {
  const form = new FormData()
  form.set('file', file)
  form.set('source_url', sourceUrl)
  return apiRequest<TenderAdmin>('/admin/tenders', { method: 'POST', token, form })
}

export function updateTender(token: string, id: number, changes: TenderChanges) {
  return apiRequest<TenderAdmin>(`/admin/tenders/${id}`, { method: 'PATCH', token, json: changes })
}

export function publishTender(token: string, id: number) {
  return apiRequest<TenderAdmin>(`/admin/tenders/${id}/publish`, { method: 'POST', token })
}

export function unpublishTender(token: string, id: number) {
  return apiRequest<TenderAdmin>(`/admin/tenders/${id}/unpublish`, { method: 'POST', token })
}
