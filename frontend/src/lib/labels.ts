import type { BuyerType, Category, DocumentType, OpenStatus } from '../api/types'

export const CATEGORY_LABELS: Record<Category, string> = {
  drone: 'Drone',
  counter_drone: 'Counter-drone',
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  RFI: 'RFI',
  RFP: 'RFP',
}

export const BUYER_TYPE_LABELS: Record<BuyerType, string> = {
  central: 'Central',
  state: 'State',
}

export const OPEN_STATUS_LABELS: Record<OpenStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  all: 'All',
}
