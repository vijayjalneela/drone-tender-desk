import { ApiError } from '../api/client'
import type { TenderAdmin } from '../api/types'
import { FIELD_LABELS } from './tenderFields'

export const PUBLISH_CONFIRM = 'Publish this tender? It will be visible to everyone.'
export const UNPUBLISH_CONFIRM = 'Unpublish this tender? It will be hidden from the public list.'
export const EXTRACTION_FAILED =
  'Automatic extraction did not work for this document. Please fill in the fields by hand.'

/** Draft, Published or Closed. Closed applies only to published tenders (frontend-spec §4.4). */
export function adminState(tender: TenderAdmin): 'Draft' | 'Published' | 'Closed' {
  if (tender.status === 'draft') return 'Draft'
  return tender.is_closed ? 'Closed' : 'Published'
}

/** A message for a failed save, publish or unpublish, naming any fields at fault. */
export function actionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'validation_error' && error.fields.length > 0) {
      const names = error.fields.map((f) => FIELD_LABELS[f.field] ?? f.field)
      return `${error.message} Check: ${names.join(', ')}.`
    }
    if (error.status === 0) return 'Could not reach the server. Your changes are still here; please try again.'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
  } catch {
    return false
  }
}
