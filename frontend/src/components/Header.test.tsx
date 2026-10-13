import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { Header } from './Header'

describe('Header', () => {
  it('shows the site name and a link to the tender list', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Drone Tender Desk' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Tenders' })).toHaveAttribute('href', '/')
  })
})
