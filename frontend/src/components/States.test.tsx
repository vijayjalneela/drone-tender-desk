import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { mockApi, page, renderApp, summary } from '../test/helpers'
import { Loading } from './States'

const SLOW = 'Starting up the server. This can take up to a minute.'

describe('Loading', () => {
  it('adds the "starting up" message only after 5 seconds', () => {
    vi.useFakeTimers()
    render(<Loading label="Loading tenders…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading tenders…')
    act(() => vi.advanceTimersByTime(4999))
    expect(screen.queryByText(SLOW)).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText(SLOW)).toBeInTheDocument()
  })
})

describe('A cold start on a real page', () => {
  it('shows the message while the server wakes, then the data replaces it', async () => {
    // shouldAdvanceTime keeps real time flowing so React Query and waitFor still work.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let wake: () => void = () => {}
    const fetchMock = mockApi(() => 'never')
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          wake = () =>
            resolve(new Response(JSON.stringify(page([summary()])), { headers: { 'Content-Type': 'application/json' } }))
        }),
    )

    renderApp('/')
    await screen.findByText('Loading tenders…')
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText(SLOW)).toBeInTheDocument()

    act(() => wake())

    expect(await screen.findByText('Procurement of Counter Drone Systems')).toBeInTheDocument()
    expect(screen.queryByText(SLOW)).not.toBeInTheDocument()
  })
})
