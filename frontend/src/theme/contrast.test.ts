// WCAG AA contrast for the theme tokens (frontend-spec §7.1), read from the real CSS,
// so a later colour tweak cannot quietly make text hard to read.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Read from disk: Vitest replaces CSS imports (even ?raw) with empty modules.
// Tests run from frontend/ (Vitest's root), and import.meta.url is not a file URL under jsdom.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

const WHITE = '#ffffff'
const TEXT = 4.5 // normal text
const LARGE = 3 // large text, button and badge edges, focus outline

function tokens(source: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of source.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    found[match[1]] = match[2].toLowerCase()
  }
  return found
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const T = tokens(css)

describe('theme tokens', () => {
  it('are all present as 6-digit hex values', () => {
    for (const name of [
      'navy-900', 'navy-800', 'navy-700', 'saffron-100', 'india-green-100',
      'open-bg', 'open-text', 'soon-bg', 'soon-text', 'closed-bg', 'closed-text', 'page', 'muted',
    ]) {
      expect(T[name], name).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('the contrast formula matches known values', () => {
    expect(contrast('#000000', WHITE)).toBeCloseTo(21, 5)
    expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 5)
  })
})

describe('text contrast is at least 4.5:1', () => {
  const pairs: [string, string, string][] = [
    ['headings on white', T['navy-900'], WHITE],
    ['headings on the page background', T['navy-900'], T.page],
    ['header text on the saffron end of the band', T['navy-900'], T['saffron-100']],
    ['header text on the green end of the band', T['navy-900'], T['india-green-100']],
    ['links on white', T['navy-700'], WHITE],
    ['links on the saffron end of the band', T['navy-700'], T['saffron-100']],
    ['links on the green end of the band', T['navy-700'], T['india-green-100']],
    ['button text on navy', WHITE, T['navy-700']],
    ['button text on hovered navy', WHITE, T['navy-800']],
    ['"Open" badge', T['open-text'], T['open-bg']],
    ['"Closing soon" badge', T['soon-text'], T['soon-bg']],
    ['"Closed" badge', T['closed-text'], T['closed-bg']],
    ['secondary text on white', T.muted, WHITE],
    ['secondary text (footer) on the page background', T.muted, T.page],
  ]

  it.each(pairs)('%s', (_, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(TEXT)
  })
})

describe('non-text contrast is at least 3:1', () => {
  it.each([
    ['primary button against white', T['navy-700'], WHITE],
    ['primary button against the page background', T['navy-700'], T.page],
    ['focus outline against white', T['navy-700'], WHITE],
    ['focus outline against the band', T['navy-700'], T['saffron-100']],
  ])('%s', (_, a, b) => {
    expect(contrast(a, b)).toBeGreaterThanOrEqual(LARGE)
  })
})
