import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { API_BASE, E2E_ADMIN } from './constants.ts'

// The slice-1 journey (frontend-spec §6 "Add a tender" and "Find a tender"):
// an admin logs in, uploads a PDF, fills in the fields by hand, and publishes;
// the tender then appears on the public Tender List and Detail pages.

const FIXTURES = join(import.meta.dirname, 'fixtures')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A date `days` from today in India, as YYYY-MM-DD and as the site writes it. */
function indiaDate(days: number) {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(Date.now() + days * 86_400_000),
  )
  const [y, m, d] = iso.split('-').map(Number)
  return { iso, shown: `${d} ${MONTHS[m - 1]} ${y}` }
}

async function logIn(page: Page, password = E2E_ADMIN.password) {
  await page.getByLabel('Username').fill(E2E_ADMIN.username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

test('admin adds a tender by hand, publishes it, and the public can find it', async ({ page, request }) => {
  const title = `E2E counter drone procurement ${Date.now()}`
  const closing = indiaDate(30)
  const source = 'https://example.gov.in/e2e-tender.pdf'

  await test.step('a visitor cannot reach the admin area or the admin API', async () => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login$/)
    expect((await request.get(`${API_BASE}/api/admin/tenders`)).status()).toBe(401)
  })

  await test.step('a wrong password is refused; the username is kept, the password cleared', async () => {
    await logIn(page, 'not the password')
    await expect(page.getByRole('alert')).toHaveText('Incorrect username or password.')
    await expect(page.getByLabel('Username')).toHaveValue(E2E_ADMIN.username)
    await expect(page.getByLabel('Password')).toHaveValue('')
  })

  await test.step('the admin logs in and lands on the dashboard', async () => {
    await logIn(page)
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
  })

  await test.step('Add tender refuses a file that is not a PDF', async () => {
    await page.getByRole('link', { name: 'Add tender' }).click()
    await page.getByLabel(/Tender PDF/).setInputFiles(join(FIXTURES, 'not-a-pdf.pdf'))
    await page.getByLabel(/Source URL/).fill(source)
    await expect(page.getByRole('alert')).toHaveText('Please choose a PDF file')
    await expect(page.getByRole('button', { name: 'Extract' })).toBeDisabled()
  })

  await test.step('uploading a PDF creates an empty draft and opens Review', async () => {
    await page.getByLabel(/Tender PDF/).setInputFiles(join(FIXTURES, 'sample-tender.pdf'))
    await page.getByRole('button', { name: 'Extract' }).click()
    await expect(page).toHaveURL(/\/admin\/tenders\/\d+\/review$/)
    await expect(
      page.getByText('Automatic extraction did not work for this document. Please fill in the fields by hand.'),
    ).toBeVisible()
    await expect(page.getByText('Not found in document.').first()).toBeVisible()
    await expect(page.getByLabel('Source URL')).toHaveValue(source)
    await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  await test.step('the admin fills in the fields by hand and publishes', async () => {
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Issuing body').fill('Border Security Force')
    await page.getByLabel('Buyer type').selectOption({ label: 'Central' })
    await page.getByLabel('Document type').selectOption('RFP')
    await page.getByLabel('Category').selectOption({ label: 'Counter-drone' })
    await page.getByLabel('Key technical requirements').fill('Detection radar range at least 3 km')
    await page.getByLabel('Earnest money deposit (EMD)').fill('Rs 5,00,000')
    await page.getByLabel('Bid closing date').fill(closing.iso)

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('Publish this tender? It will be visible to everyone.')
      void dialog.accept()
    })
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Published. The tender is now on the public list.')).toBeVisible()
  })

  await test.step('the tender appears on the public list, open, and is found by search', async () => {
    await page.goto('/')
    const row = page.getByRole('listitem').filter({ hasText: title })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Border Security Force')
    await expect(row).toContainText('RFP')
    await expect(row).toContainText('Counter-drone')
    await expect(row).toContainText(`Closes ${closing.shown}`)
    await expect(row).toContainText('Open')

    await page.getByRole('searchbox', { name: 'Search tenders' }).fill('radar')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page).toHaveURL(/\?q=radar$/)
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()
  })

  await test.step('the detail page shows the fields, the notice and the source link', async () => {
    await page.getByRole('listitem').filter({ hasText: title }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText('This is a summary. The original document is authoritative.')).toBeVisible()
    await expect(page.getByText('Detection radar range at least 3 km')).toBeVisible()
    await expect(page.getByText('Rs 5,00,000')).toBeVisible()
    await expect(page.getByText(closing.shown)).toBeVisible()
    await expect(page.getByText('Not stated in the document.').first()).toBeVisible() // e.g. reference number
    const original = page.getByRole('link', { name: 'View original document' })
    await expect(original).toHaveAttribute('href', source)
    await expect(original).toHaveAttribute('target', '_blank')

    await page.getByRole('link', { name: '← Back to tenders' }).click()
    await expect(page).toHaveURL(/\/\?q=radar$/)
  })

  await test.step('unpublishing removes it from public view at once', async () => {
    const detailUrl = await page.getByRole('listitem').filter({ hasText: title }).getByRole('link').getAttribute('href')
    await page.getByRole('link', { name: 'Admin dashboard' }).click()
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: `Unpublish ${title}` }).click()
    await expect(page.getByRole('row').filter({ hasText: title })).toContainText('Draft')

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Drone and counter-drone tenders' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)
    await page.goto(detailUrl!)
    await expect(page.getByText('Tender not found')).toBeVisible()
  })

  await test.step('logging out returns to the public list and locks the admin area again', async () => {
    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login$/)
  })
})

test('a published tender fits a 375 px phone screen without sideways scrolling', async ({ page, request }) => {
  // Publish a tender with long text through the API, so a real row must fit.
  const login = await request.post(`${API_BASE}/api/admin/login`, { data: E2E_ADMIN })
  const auth = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const created = await request.post(`${API_BASE}/api/admin/tenders`, {
    headers: auth,
    multipart: {
      file: { name: 'sample-tender.pdf', mimeType: 'application/pdf', buffer: readFileSync(join(FIXTURES, 'sample-tender.pdf')) },
      source_url: 'https://example.gov.in/a-very-long-path/to/the/original/tender-document-number-117.pdf',
    },
  })
  const { id } = await created.json()
  const title =
    'Procurement of vehicle-mounted counter drone systems with radar detection and RF jamming for border outposts'
  await request.patch(`${API_BASE}/api/admin/tenders/${id}`, {
    headers: auth,
    data: {
      title,
      issuing_body: 'Directorate General Border Security Force, Ministry of Home Affairs',
      buyer_type: 'state',
      state_name: 'Punjab',
      document_type: 'RFP',
      category: 'counter_drone',
      bid_closing_date: indiaDate(3).iso,
    },
  })
  expect((await request.post(`${API_BASE}/api/admin/tenders/${id}/publish`, { headers: auth })).status()).toBe(200)

  await page.setViewportSize({ width: 375, height: 800 })
  const fits = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

  await page.goto('/')
  await expect(page.getByText(title)).toBeVisible()
  await expect(page.getByText('Closing soon')).toBeVisible()
  expect(await fits()).toBeLessThanOrEqual(0)

  await page.getByText(title).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  expect(await fits()).toBeLessThanOrEqual(0)
})
