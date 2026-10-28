import { expect, test } from '@playwright/test'
import {
  SEL,
  canvasStats,
  clearWithConfirm,
  collectPageIssues,
  findPaperPixel,
  goBackToPack,
  isColorClose,
  mouseStroke,
  openDrawing,
  openHome,
  openPack,
  readPixel,
  readStoredRecords,
  redo,
  selectColor,
  settleCanvas,
  undo,
  waitForSaved,
} from './helpers/app'

const BLUE = '#5dcae2'
const GREEN = '#5cc63a'
const PINK = '#e7579a'

const PACKS = [
  'animals',
  'dinosaurs',
  'transport',
  'underwater',
  'fairytale',
  'robots',
  'princess',
  'alien',
  'christmas',
]

/** Integrated catalog distribution: six packs with 16 drawings, three with 15. */
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

test.describe('gallery navigation and painting', () => {
  test('home lists nine packs and each pack lists its catalog drawings', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)

    await expect(page.getByTestId('pack-grid').locator('a.pack-card')).toHaveCount(9)
    for (const packId of PACKS) {
      await expect(page.getByTestId(`pack-card-${packId}`)).toBeVisible()
    }
    expect(Object.values(EXPECTED_PER_PACK).reduce((sum, count) => sum + count, 0)).toBe(141)

    for (const packId of PACKS) {
      await openPack(page, packId)
      await expect(
        page.getByTestId('drawing-grid').locator('a.drawing-card'),
        `drawing cards in ${packId}`,
      ).toHaveCount(EXPECTED_PER_PACK[packId])
      await page.getByRole('link', { name: /Galerias/ }).click()
      await expect(page.getByTestId('pack-grid')).toBeVisible()
    }

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('opens a drawing, paints with the mouse and undoes/redoes the stroke', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'animals-3')

    await expect(page.locator(SEL.canvas)).toHaveAttribute('width', '1024')
    await expect(page.getByTestId('undo')).toBeDisabled()
    await expect(page.getByTestId('redo')).toBeDisabled()

    const start = await findPaperPixel(page, 512, 512)
    const before = await readPixel(page, start.x, start.y)
    expect(before.a, 'target pixel starts as blank paper').toBe(0)

    await selectColor(page, BLUE)
    await mouseStroke(page, start, { x: start.x + 70, y: start.y })
    await settleCanvas(page)

    const painted = await readPixel(page, start.x, start.y)
    expect(isColorClose(painted, BLUE), `painted pixel was ${JSON.stringify(painted)}`).toBe(true)
    await expect(page.getByTestId('undo')).toBeEnabled()

    await undo(page)
    await settleCanvas(page)
    const undone = await readPixel(page, start.x, start.y)
    expect(undone.a, 'undo removes the stroke').toBe(0)
    await expect(page.getByTestId('redo')).toBeEnabled()

    await redo(page)
    await settleCanvas(page)
    const redone = await readPixel(page, start.x, start.y)
    expect(isColorClose(redone, BLUE), 'redo restores the stroke').toBe(true)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('clear asks for confirmation, wipes pixels and can be undone', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'animals-4')

    await selectColor(page, GREEN)
    const start = await findPaperPixel(page, 470, 470)
    await mouseStroke(page, start, { x: start.x + 80, y: start.y + 20 })
    await settleCanvas(page)
    const painted = await canvasStats(page, GREEN)
    expect(painted.color).toBeGreaterThan(200)

    await page.getByTestId('clear').click()
    const dialog = page.locator(SEL.clearDialog)
    await expect(dialog).toHaveAttribute('open', '')
    await dialog.locator('button[value="cancel"]').click()
    await expect(dialog).not.toHaveAttribute('open', '')
    const afterCancel = await canvasStats(page, GREEN)
    expect(afterCancel.color, 'cancel keeps the painting').toBe(painted.color)

    await clearWithConfirm(page)
    await settleCanvas(page)
    const cleared = await canvasStats(page, GREEN)
    expect(cleared.color, 'clear removes painted colour').toBeLessThan(painted.color * 0.02)
    expect(cleared.dark, 'clear keeps the line art').toBeGreaterThan(1000)

    await undo(page)
    await settleCanvas(page)
    const restored = await canvasStats(page, GREEN)
    expect(restored.color, 'undo restores the cleared painting').toBeGreaterThan(200)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('saves automatically, shows a real thumbnail and resumes after reload', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'animals-5')

    await selectColor(page, PINK)
    const start = await findPaperPixel(page, 500, 500)
    await mouseStroke(page, start, { x: start.x + 60, y: start.y + 60 })
    await settleCanvas(page)
    const paintedCount = (await canvasStats(page, PINK)).color
    expect(paintedCount).toBeGreaterThan(150)

    await waitForSaved(page)
    await goBackToPack(page)

    const card = page.getByTestId('drawing-card-animals-5')
    await expect(card.locator('.work-badge')).toBeVisible()
    const thumbnail = card.locator('.drawing-art img')
    await expect(thumbnail).toHaveAttribute('src', /^blob:/)
    await expect
      .poll(async () => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth), {
        message: 'thumbnail image decodes',
      })
      .toBeGreaterThan(0)

    // The thumbnail must contain the painted colour, not a placeholder.
    const thumbHasPink = await thumbnail.evaluate((img: HTMLImageElement) => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return -1
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let pink = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 200 && data[i + 1] < 140 && data[i + 2] > 90 && data[i + 2] < 160) pink++
      }
      return pink
    })
    expect(thumbHasPink, 'saved thumbnail contains the painted pink').toBeGreaterThan(100)

    const records = await readStoredRecords(page)
    const record = records.find((item) => item.id === 'animals-5')
    expect(record, 'IndexedDB holds the drawing').toBeTruthy()
    expect(record?.blobSize).toBeGreaterThan(500)
    expect(record?.thumbSize ?? 0).toBeGreaterThan(500)
    expect(record?.width).toBe(1024)

    await openDrawing(page, 'animals-5')
    await settleCanvas(page)
    const resumed = await readPixel(page, start.x, start.y)
    expect(isColorClose(resumed, PINK), `resumed pixel was ${JSON.stringify(resumed)}`).toBe(true)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator(SEL.loading)).toHaveCount(0)
    await settleCanvas(page)
    const afterReload = await readPixel(page, start.x, start.y)
    expect(isColorClose(afterReload, PINK), 'painting survives a full reload').toBe(true)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('keyboard shortcuts undo and redo the last stroke', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'animals-6')

    const start = await findPaperPixel(page, 530, 470)
    await mouseStroke(page, start, { x: start.x + 50, y: start.y })
    await settleCanvas(page)
    expect((await readPixel(page, start.x, start.y)).a).toBeGreaterThan(200)

    await page.keyboard.press('Control+z')
    await settleCanvas(page)
    expect((await readPixel(page, start.x, start.y)).a).toBe(0)

    await page.keyboard.press('Control+Shift+z')
    await settleCanvas(page)
    expect((await readPixel(page, start.x, start.y)).a).toBeGreaterThan(200)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })
})
