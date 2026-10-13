import type { TenderChanges } from '../api/admin'
import type { TenderAdmin } from '../api/types'
import { BUYER_TYPE_LABELS, CATEGORY_LABELS, DOCUMENT_TYPE_LABELS } from './labels'

export type EditableField = keyof TenderChanges & keyof TenderAdmin

interface FieldBase {
  name: EditableField
  label: string
}

export type FieldDef = FieldBase &
  (
    | { kind: 'text' | 'textarea' | 'date' | 'url' }
    | { kind: 'select'; options: { value: string; label: string }[] }
  )

function options(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

/** The Review form, top to bottom. */
export const FIELDS: FieldDef[] = [
  { name: 'title', label: 'Title', kind: 'text' },
  { name: 'issuing_body', label: 'Issuing body', kind: 'text' },
  { name: 'buyer_type', label: 'Buyer type', kind: 'select', options: options(BUYER_TYPE_LABELS) },
  { name: 'state_name', label: 'State', kind: 'text' },
  { name: 'reference_number', label: 'Reference number', kind: 'text' },
  { name: 'document_type', label: 'Document type', kind: 'select', options: options(DOCUMENT_TYPE_LABELS) },
  { name: 'category', label: 'Category', kind: 'select', options: options(CATEGORY_LABELS) },
  { name: 'item_and_quantity', label: 'Item and quantity', kind: 'textarea' },
  { name: 'technical_requirements', label: 'Key technical requirements', kind: 'textarea' },
  { name: 'eligibility', label: 'Eligibility', kind: 'textarea' },
  { name: 'emd', label: 'Earnest money deposit (EMD)', kind: 'text' },
  { name: 'publish_date', label: 'Publish date', kind: 'date' },
  { name: 'bid_closing_date', label: 'Bid closing date', kind: 'date' },
  { name: 'source_url', label: 'Source URL', kind: 'url' },
]

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.name, f.label]))

/** The form keeps every field as a string; "" means empty. */
export type FormValues = Record<EditableField, string>

export function toFormValues(tender: TenderAdmin): FormValues {
  return Object.fromEntries(FIELDS.map((f) => [f.name, tender[f.name] ?? ''])) as FormValues
}

/** Form values → PATCH body. Empty text becomes null (never ""); a Central buyer has no state. */
export function toChanges(values: FormValues): TenderChanges {
  const changes: Record<string, string | null> = {}
  for (const field of FIELDS) {
    const value = values[field.name].trim()
    changes[field.name] = value === '' ? null : value
  }
  if (changes.buyer_type !== 'state') changes.state_name = null
  return changes as TenderChanges
}

/** Fields that must be filled before publishing (frontend-spec §4.6, backend-spec §4 rule 2). */
export function missingRequired(values: FormValues): EditableField[] {
  const required: EditableField[] = [
    'title',
    'issuing_body',
    'buyer_type',
    'document_type',
    'category',
    'bid_closing_date',
    'source_url',
  ]
  if (values.buyer_type === 'state') required.push('state_name')
  return required.filter((name) => values[name].trim() === '')
}
