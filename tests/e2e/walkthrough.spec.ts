import { expect, test, type Page } from '@playwright/test'
import {
  canvasStats,
  collectPageIssues,
  findPaperPixel,
  goBackToPack,
  isColorClose,
  mouseStroke,
  mouseTap,
  openDrawing,
  openHome,
  openPack,
  paintedComponent,
  readPixel,
  readStoredRecords,
  selectColor,
  selectGlitter,
  selectTool,
  settleCanvas,
  sparkleStats,
  waitForSaved,
} from './helpers/app'

const BLUE = '#5dcae2'
const PINK = '#e7579a'

/**
 * Gallery distribution delivered with the integrated catalog: six packs with
 * 16 drawings, three with 15 (141 total). The footer must agree with the cards.
 */
const EXPECTED_PER_PACK: Record<string, number> = {
  animals: 16,
  dinosaurs: 15,
  transport: 16,
  underwater: 16,
  fairytale: 16,
  robots: 16,
  princess: 15,
  alien: 15,
  christmas: 16,
}

/**
 * Walks the exact product flow from the QA brief, end to end:
 * home -> gallery -> painting -> tools -> glitter bucket -> save -> reopen.
 */
async function fillBounded(
  page: Page,
  hex: string,
  keep?: { x: number; y: number },
): Promise<{ size: number }> {
  const candidates = [
    { x: 512, y: 512 },
    { x: 430, y: 480 },
    { x: 590, y: 520 },
    { x: 512, y: 390 },
    { x: 360, y: 560 },
  ]
  for (const candidate of candidates) {
    await mouseTap(page, candidate.x, candidate.y)
    await settleCanvas(page)
    const component = await paintedComponent(page, hex)
    const painted = (await canvasStats(page, hex)).color
    // Glitter texture scatters a few isolated speckles, so the largest
    // component may not be the only one; it must still be the region itself.
    const keptPixel = keep
      ? isColorClose(await readPixel(page, keep.x, keep.y), BLUE)
      : true
    if (
      component.size > 1500 &&
      component.size < 300_000 &&
      component.size > painted * 0.75 &&
      !component.touchesBorder &&
      keptPixel
    ) {
      return { size: component.size }
    }
    if (component.size > 0) {
      await page.getByTestId('undo').click()
      await settleCanvas(page)
    }
  }
  throw new Error('no bounded region found')
}

test.describe('QA brief walkthrough', () => {
  test('home -> gallery -> painting -> tools -> glitter bucket -> save -> reopen', async ({
    page,
  }) => {
    const issues = collectPageIssues(page)

    // Home: nine galleries.
    await openHome(page)
    await expect(page.getByTestId('pack-grid').locator('a.pack-card')).toHaveCount(9)

    // Galleries: every pack lists the expected number of drawings and the
    // footer count matches the rendered cards.
    for (const [packId, expected] of Object.entries(EXPECTED_PER_PACK)) {
      await openPack(page, packId)
      await expect(
        page.getByTestId('drawing-grid').locator('a.drawing-card'),
        `drawing cards in ${packId}`,
      ).toHaveCount(expected)
      const footer = page.locator('.site-footer p')
      await expect(footer, `footer count in ${packId}`).toContainText(`${expected} desenhos`)
      await page.getByRole('link', { name: /Galerias/ }).click()
      await expect(page.getByTestId('pack-grid')).toBeVisible()
    }
    expect(Object.values(EXPECTED_PER_PACK).reduce((sum, n) => sum + n, 0)).toBe(141)

    // Painting: open a drawing from a gallery and check the studio chrome.
    await openPack(page, 'animals')
    const card = page.getByTestId('drawing-card-animals-2')
    await card.click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator('[data-testid="drawing-canvas"]')).toBeVisible()
    await expect(page.locator('[data-loading]')).toHaveCount(0)

    // Tools: brush stroke in blue.
    await selectTool(page, 'brush')
    await selectColor(page, BLUE)
    const start = await findPaperPixel(page, 500, 500)
    await mouseStroke(page, start, { x: start.x + 80, y: start.y + 20 })
    await settleCanvas(page)
    expect((await canvasStats(page, BLUE)).color).toBeGreaterThan(150)
    await waitForSaved(page)

    // Glitter bucket: same region painted with sparkle texture.
    await selectTool(page, 'fill')
    await selectColor(page, PINK)
    await selectGlitter(page)
    const filled = await fillBounded(page, PINK, start)
    const component = await paintedComponent(page, PINK)
    const stats = await sparkleStats(page, PINK, {
      x: Math.max(0, component.minX - 4),
      y: Math.max(0, component.minY - 4),
      width: component.maxX - component.minX + 8,
      height: component.maxY - component.minY + 8,
    })
    expect(stats.light, 'glitter bucket leaves visible sparkles').toBeGreaterThan(40)
    expect(filled.size).toBeGreaterThan(1500)
    await waitForSaved(page)

    // Save: IndexedDB has a colour blob and a thumbnail.
    const records = await readStoredRecords(page)
    const record = records.find((item) => item.id === 'animals-2')
    expect(record, 'drawing saved in IndexedDB').toBeTruthy()
    expect(record?.blobSize ?? 0).toBeGreaterThan(500)
    expect(record?.thumbSize ?? 0).toBeGreaterThan(500)

    // Back to gallery: the card shows work and a decodable thumbnail.
    await goBackToPack(page)
    const savedCard = page.getByTestId('drawing-card-animals-2')
    await expect(savedCard.locator('.work-badge')).toBeVisible()
    const thumb = savedCard.locator('.drawing-art img')
    await expect(thumb).toHaveAttribute('src', /^blob:/)
    await expect
      .poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)

    // Reopen from the home "Minhas obras" page.
    await page.getByRole('link', { name: /Galerias/ }).click()
    await expect(page.getByTestId('pack-grid')).toBeVisible()
    await page.getByRole('link', { name: /Minhas obras/ }).click()
    await expect(page.getByTestId('mine-grid')).toBeVisible()
    await page.getByTestId('mine-card-animals-2').click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await settleCanvas(page)

    const brushPixel = await readPixel(page, start.x, start.y)
    expect(isColorClose(brushPixel, BLUE), 'brush pixel survives reopen').toBe(true)
    expect((await canvasStats(page, PINK)).color, 'bucket region survives reopen').toBeGreaterThan(
      filled.size * 0.8,
    )

    // Reopen again after a full document reload.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator('[data-loading]')).toHaveCount(0)
    await settleCanvas(page)
    expect((await canvasStats(page, PINK)).color, 'bucket survives reload').toBeGreaterThan(
      filled.size * 0.8,
    )

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('drawing reopened directly by hash keeps saved work', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'robots-1')
    await selectColor(page, BLUE)
    const start = await findPaperPixel(page, 480, 520)
    await mouseStroke(page, start, { x: start.x + 60, y: start.y })
    await settleCanvas(page)
    await waitForSaved(page)

    await page.goto('/#/draw/robots-1', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator('[data-loading]')).toHaveCount(0)
    await settleCanvas(page)
    expect(isColorClose(await readPixel(page, start.x, start.y), BLUE)).toBe(true)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })
})
