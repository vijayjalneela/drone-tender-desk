import { apiRequest } from './client'
import type { BuyerType, Category, DocumentType, OpenStatus, Page, TenderDetail, TenderSummary } from './types'

export const PAGE_SIZE = 20

export interface TenderListParams {
  q?: string
  category?: Category
  document_type?: DocumentType
  buyer_type?: BuyerType
  status: OpenStatus
  page: number
}

export function fetchTenders(params: TenderListParams, signal?: AbortSignal, pageSize = PAGE_SIZE) {
  return apiRequest<Page<TenderSummary>>('/tenders', {
    query: { ...params, page_size: pageSize },
    signal,
  })
}

export function fetchTender(id: number, signal?: AbortSignal) {
  return apiRequest<TenderDetail>(`/tenders/${id}`, { signal })
}
