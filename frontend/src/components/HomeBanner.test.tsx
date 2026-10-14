import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { detail, mockApi, page, renderApp } from '../test/helpers'
import { HomeBanner } from './HomeBanner'

const TAGLINE = 'Every drone and counter-drone tender from central and state buyers, in one place.'

describe('Home banner', () => {
  it('shows the tagline on the home page, above the list heading', async () => {
    mockApi(() => ({ body: page([]) }))

    renderApp('/')

    const tagline = await screen.findByText(TAGLINE)
    const heading = screen.getByRole('heading', { name: 'Drone and counter-drone tenders' })
    expect(tagline.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is only on the home page', async () => {
    mockApi(() => ({ body: detail() }))

    renderApp('/tenders/1')

    await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })
    expect(screen.queryByText(TAGLINE)).not.toBeInTheDocument()
  })

  it('hides the drawing from screen readers', () => {
    render(<HomeBanner />)

    const art = screen.getByTestId('banner-art')
    expect(art).toHaveAttribute('aria-hidden', 'true')
    expect(art).toHaveAttribute('focusable', 'false')
  })

  it('draws both a drone and a radar', () => {
    const { container } = render(<HomeBanner />)

    expect(container.querySelector('[data-part="drone"]')).not.toBeNull()
    expect(container.querySelector('[data-part="radar"]')).not.toBeNull()
  })

  it('gives the radar no spokes: no lines, and no outlined paths, anywhere in it', () => {
    const { container } = render(<HomeBanner />)
    const radar = container.querySelector('[data-part="radar"]')!

    expect(radar.querySelectorAll('line, polyline')).toHaveLength(0)
    for (const path of radar.querySelectorAll('path')) {
      expect(path.getAttribute('stroke')).toBe('none')
    }
  })

  it('only animates the sweep when the device allows motion', () => {
    const { container } = render(<HomeBanner />)
    const sweep = container.querySelector('[data-part="sweep"]')!
    const classes = (sweep.getAttribute('class') ?? '').split(/\s+/)

    expect(classes.some((c) => c.startsWith('motion-safe:animate-'))).toBe(true)
    expect(classes.some((c) => c.startsWith('animate-'))).toBe(false)
  })

  it('uses no images or external files', () => {
    const { container } = render(<HomeBanner />)

    expect(container.querySelectorAll('img, image, use[href^="http"]')).toHaveLength(0)
  })
})
