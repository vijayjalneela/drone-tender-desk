// Badge colours (frontend-spec §7.1). The colours' contrast is checked in theme/contrast.test.ts;
// these tests check each badge uses the right colour family and keeps its word.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { adminTender } from '../test/helpers'
import { AdminStateBadge } from './AdminStateBadge'
import { StatusBadge } from './StatusBadge'

const TODAY = '2026-11-14'

describe('public status badges', () => {
  it('Open is green', () => {
    render(<StatusBadge isClosed={false} closingDate="2026-12-31" today={TODAY} />)

    expect(screen.getByText('Open')).toHaveClass('bg-open-bg', 'text-open-text')
  })

  it('Closing soon is amber, beside a green Open', () => {
    render(<StatusBadge isClosed={false} closingDate="2026-11-16" today={TODAY} />)

    expect(screen.getByText('Closing soon')).toHaveClass('bg-soon-bg', 'text-soon-text')
    expect(screen.getByText('Open')).toHaveClass('bg-open-bg')
  })

  it('Closed is grey', () => {
    render(<StatusBadge isClosed closingDate="2026-11-01" today={TODAY} />)

    expect(screen.getByText('Closed')).toHaveClass('bg-closed-bg', 'text-closed-text')
  })
})

describe('admin state badges', () => {
  it.each([
    ['Published', adminTender({ status: 'published', is_closed: false }), ['bg-open-bg', 'text-open-text']],
    ['Closed', adminTender({ status: 'published', is_closed: true }), ['bg-closed-bg', 'text-closed-text']],
    ['Draft', adminTender({ status: 'draft' }), ['border', 'bg-white']],
  ] as const)('%s', (word, tender, classes) => {
    render(<AdminStateBadge tender={tender} />)

    expect(screen.getByText(word)).toHaveClass(...classes)
  })
})
