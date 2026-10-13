// Shapes from specs/api-contract.md §2. Dates are YYYY-MM-DD strings, timestamps
// are ISO 8601 strings in IST, and empty fields are null.

export type BuyerType = 'central' | 'state'
export type DocumentType = 'RFI' | 'RFP'
export type Category = 'drone' | 'counter_drone'
export type TenderStatus = 'draft' | 'published'
export type ExtractionStatus = 'succeeded' | 'partial' | 'failed'
export type OpenStatus = 'open' | 'closed' | 'all'

export interface TenderSummary {
  id: number
  title: string | null
  issuing_body: string | null
  buyer_type: BuyerType | null
  state_name: string | null
  document_type: DocumentType | null
  category: Category | null
  bid_closing_date: string | null
  is_closed: boolean
}

export interface TenderDetail extends TenderSummary {
  reference_number: string | null
  item_and_quantity: string | null
  technical_requirements: string | null
  eligibility: string | null
  emd: string | null
  publish_date: string | null
  source_url: string
}

export interface TenderAdmin extends TenderDetail {
  status: TenderStatus
  extraction_status: ExtractionStatus
  fields_not_found: string[]
  created_at: string
  updated_at: string
  published_at: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface FieldProblem {
  field: string
  problem: string
}

export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    fields?: FieldProblem[]
  }
}

export interface LoginResponse {
  access_token: string
  token_type: 'bearer'
  expires_at: string
}
