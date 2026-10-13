import { describe, expect, it } from 'vitest'

import { daysBetween, formatDate, isClosingSoon, todayInIndia } from './dates'

describe('formatDate', () => {
  it.each([
    ['2026-11-14', '14 Nov 2026'],
    ['2026-01-03', '3 Jan 2026'],
    ['2026-04-03', '3 Apr 2026'], // never "03/04"
    ['2027-12-31', '31 Dec 2027'],
  ])('%s → %s', (iso, shown) => {
    expect(formatDate(iso)).toBe(shown)
  })

  it.each(['', 'not a date', '14/11/2026', '2026-13-01'])('returns %j unchanged', (raw) => {
    expect(formatDate(raw)).toBe(raw)
  })
})

describe('todayInIndia', () => {
  it('is already the next day in India at 20:00 UTC', () => {
    expect(todayInIndia(new Date('2026-11-13T20:00:00Z'))).toBe('2026-11-14')
  })

  it('is still the same day in India at 18:00 UTC', () => {
    expect(todayInIndia(new Date('2026-11-13T18:00:00Z'))).toBe('2026-11-13')
  })
})

describe('daysBetween', () => {
  it('counts whole calendar days across a month end', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3)
  })

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-11-14', '2026-11-13')).toBe(-1)
  })
})

describe('isClosingSoon', () => {
  const today = '2026-11-14'

  it.each([
    ['2026-11-14', true], // closes today
    ['2026-11-21', true], // exactly 7 days away
    ['2026-11-22', false], // 8 days away
    ['2026-11-13', false], // already past
  ])('closing %s → %s', (closing, expected) => {
    expect(isClosingSoon(closing, false, today)).toBe(expected)
  })

  it('is never shown for a closed tender', () => {
    expect(isClosingSoon('2026-11-15', true, today)).toBe(false)
  })

  it('is false without a closing date', () => {
    expect(isClosingSoon(null, false, today)).toBe(false)
  })
})
