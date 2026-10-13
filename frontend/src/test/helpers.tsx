import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'

import type { Page, TenderDetail, TenderSummary } from '../api/types'
import { routes } from '../routes'

/** Renders the whole app at `path`, with a fresh query cache and no retry delays. */
export function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, user }
}

type Reply = { status?: number; body: unknown } | 'network-error' | 'never'

/** Stubs fetch; `handler` sees each request's URL and method and says how to answer. */
export function mockApi(handler: (url: URL, init: RequestInit) => Reply) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const reply = handler(new URL(String(input)), init)
    if (reply === 'never') return new Promise<Response>(() => {})
    if (reply === 'network-error') throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The URLs fetch was called with, as URL objects. */
export function requestedUrls(fetchMock: ReturnType<typeof mockApi>): URL[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input)))
}

export function page<T>(items: T[], total = items.length, pageNumber = 1, pageSize = 20): Page<T> {
  return { items, total, page: pageNumber, page_size: pageSize }
}

export function summary(overrides: Partial<TenderSummary> = {}): TenderSummary {
  return {
    id: 1,
    title: 'Procurement of Counter Drone Systems',
    issuing_body: 'Border Security Force',
    buyer_type: 'central',
    state_name: null,
    document_type: 'RFP',
    category: 'counter_drone',
    bid_closing_date: '2026-11-20',
    is_closed: false,
    ...overrides,
  }
}

export function detail(overrides: Partial<TenderDetail> = {}): TenderDetail {
  return {
    ...summary(),
    reference_number: 'BSF/PROC/2026/117',
    item_and_quantity: 'Vehicle-mounted counter-drone system, 12 units',
    technical_requirements: 'Detection range at least 3 km',
    eligibility: 'Average annual turnover of Rs 10 crore',
    emd: 'Rs 5,00,000',
    publish_date: '2026-10-01',
    source_url: 'https://example.gov.in/tender117.pdf',
    ...overrides,
  }
}

/** Freezes only the clock (not timers) so "today" in India is 14 Nov 2026. */
export function freezeToday() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T06:00:00Z')) // 11:30 in India
}
