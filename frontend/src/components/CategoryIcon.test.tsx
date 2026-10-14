import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { detail, mockApi, page, renderApp, summary } from '../test/helpers'

function rowFor(title: string) {
  return screen.getByText(title).closest('li') as HTMLElement
}

function iconsIn(element: Element) {
  return Array.from(element.querySelectorAll('svg[data-icon]')).map((svg) => svg.getAttribute('data-icon'))
}

describe('Category icons on list rows', () => {
  it('shows a drone icon for Drone and a radar-shield icon for Counter-drone, next to the name', async () => {
    mockApi(() => ({
      body: page([
        summary({ id: 1, title: 'Surveillance UAV', category: 'drone' }),
        summary({ id: 2, title: 'Jammer system', category: 'counter_drone' }),
        summary({ id: 3, title: 'Uncategorised', category: null }),
      ]),
    }))

    renderApp('/')

    await screen.findByText('Surveillance UAV')
    expect(iconsIn(rowFor('Surveillance UAV'))).toEqual(['drone'])
    expect(within(rowFor('Surveillance UAV')).getByText('Drone')).toBeInTheDocument()
    expect(iconsIn(rowFor('Jammer system'))).toEqual(['counter-drone'])
    expect(within(rowFor('Jammer system')).getByText('Counter-drone')).toBeInTheDocument()
    expect(iconsIn(rowFor('Uncategorised'))).toEqual([])
  })

  it('hides the icons from screen readers', async () => {
    mockApi(() => ({ body: page([summary({ category: 'drone' })]) }))

    renderApp('/')

    await screen.findByText('Procurement of Counter Drone Systems')
    for (const svg of document.querySelectorAll('svg[data-icon]')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveAttribute('focusable', 'false')
    }
  })
})

describe('Category icon on the detail page', () => {
  function categoryField() {
    return screen.getByText('Category', { selector: 'dt' }).nextElementSibling as HTMLElement
  }

  it.each([
    ['drone', 'drone', 'Drone'],
    ['counter_drone', 'counter-drone', 'Counter-drone'],
  ] as const)('%s → %s icon beside "%s"', async (category, icon, label) => {
    mockApi(() => ({ body: detail({ category }) }))

    renderApp('/tenders/1')

    await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })
    expect(iconsIn(categoryField())).toEqual([icon])
    expect(categoryField()).toHaveTextContent(label)
  })

  it('shows no icon and "Not stated in the document." when the category is empty', async () => {
    mockApi(() => ({ body: detail({ category: null }) }))

    renderApp('/tenders/1')

    await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })
    expect(iconsIn(categoryField())).toEqual([])
    expect(categoryField()).toHaveTextContent('Not stated in the document.')
  })

  it('the radar-shield icon has no spokes: no straight lines from its centre', async () => {
    mockApi(() => ({ body: detail({ category: 'counter_drone' }) }))

    renderApp('/tenders/1')

    await screen.findByRole('heading', { name: 'Procurement of Counter Drone Systems' })
    const icon = categoryField().querySelector('svg[data-icon="counter-drone"]')!
    expect(icon.querySelectorAll('line, polyline')).toHaveLength(0)
  })
})
