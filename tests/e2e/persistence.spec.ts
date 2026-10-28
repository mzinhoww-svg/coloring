import { expect, test } from '@playwright/test'
import {
  SEL,
  collectPageIssues,
  findPaperPixel,
  isColorClose,
  mouseStroke,
  openDrawing,
  openDrawingDirect,
  openHome,
  readPixel,
  readStoredPixel,
  readStoredRecords,
  seedRecord,
  selectColor,
  selectTool,
  settleCanvas,
  undo,
  waitForSaved,
} from './helpers/app'
import { touchCancelStroke } from './helpers/touch'

const RED = '#e7579a'
const BLUE = '#5dcae2'

test.describe('persistence, races and failure recovery', () => {
  test('autosaves on pagehide when the page is reloaded immediately after a stroke', async ({
    page,
  }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'dinosaurs-1')

    const start = await findPaperPixel(page, 500, 500)
    await selectColor(page, RED)
    await mouseStroke(page, start, { x: start.x + 60, y: start.y + 20 })
    await settleCanvas(page)
    expect((await readPixel(page, start.x, start.y)).a).toBeGreaterThan(200)

    // No waitForSaved: this is the "user closes the tab right after painting" case.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator(SEL.loading)).toHaveCount(0)
    await settleCanvas(page)

    const resumed = await readPixel(page, start.x, start.y)
    expect(
      isColorClose(resumed, RED),
      `pagehide flush lost the stroke; pixel after reload ${JSON.stringify(resumed)}`,
    ).toBe(true)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('hash navigation during an unsaved stroke keeps drawings isolated', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'dinosaurs-2')
    await selectColor(page, RED)
    const a = await findPaperPixel(page, 480, 480)
    await mouseStroke(page, a, { x: a.x + 50, y: a.y })
    await settleCanvas(page)

    // Bypass the back button (which awaits the save) to stress the route guard.
    await page.evaluate(() => {
      window.location.hash = '#/draw/dinosaurs-3'
    })
    await expect(page).toHaveURL(/#\/draw\/dinosaurs-3$/)
    await expect(page.locator(SEL.loading)).toHaveCount(0)

    await selectColor(page, BLUE)
    const b = await findPaperPixel(page, 520, 520)
    await mouseStroke(page, b, { x: b.x + 50, y: b.y })
    await settleCanvas(page)
    await page.evaluate(() => {
      window.location.hash = '#/draw/dinosaurs-2'
    })
    await expect(page).toHaveURL(/#\/draw\/dinosaurs-2$/)
    await expect(page.locator(SEL.loading)).toHaveCount(0)
    await settleCanvas(page)

    const restoredA = await readPixel(page, a.x, a.y)
    expect(isColorClose(restoredA, RED), `A pixel ${JSON.stringify(restoredA)}`).toBe(true)

    const storedA = await readStoredPixel(page, 'dinosaurs-2', a.x, a.y)
    const storedB = await readStoredPixel(page, 'dinosaurs-3', b.x, b.y)
    expect(storedA, 'stored blob for A exists').not.toBeNull()
    expect(storedB, 'stored blob for B exists').not.toBeNull()
    expect(isColorClose(storedA!, RED), 'A blob holds its own red stroke').toBe(true)
    expect(isColorClose(storedB!, BLUE), 'B blob holds its own blue stroke').toBe(true)

    const records = await readStoredRecords(page)
    expect(records.map((record) => record.id).sort()).toEqual(['dinosaurs-2', 'dinosaurs-3'])

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('recovers with a visible warning when a saved painting is corrupt', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await seedRecord(page, {
      id: 'dinosaurs-4',
      blob: new Blob(['this is not a png'], { type: 'image/png' }),
    })

    await openDrawingDirect(page, 'dinosaurs-4')
    await expect(page.locator(SEL.toast)).toBeVisible()
    await expect(page.locator(SEL.toast)).toContainText(/não pôde ser restaurada/i)
    await expect(page.locator(SEL.loadError)).toBeHidden()

    // The studio still works: paint on the fresh page and save it.
    await selectColor(page, BLUE)
    const start = await findPaperPixel(page, 500, 500)
    await mouseStroke(page, start, { x: start.x + 40, y: start.y })
    await settleCanvas(page)
    expect((await readPixel(page, start.x, start.y)).a).toBeGreaterThan(200)
    await waitForSaved(page)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('shows a real storage failure to the user when IndexedDB is unavailable', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = indexedDB.open.bind(indexedDB)
      indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
        void original
        void args
        throw new DOMException('Quota exceeded for testing', 'QuotaExceededError')
      }
    })
    const issues = collectPageIssues(page)
    await openHome(page)

    const banner = page.locator(SEL.storageBanner)
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('role', 'alert')
    await expect(banner).toContainText(/não foi possível salvar/i)

    await page.getByTestId('pack-card-animals').click()
    await page.getByTestId('drawing-card-animals-1').click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator(SEL.loading)).toHaveCount(0)

    await selectColor(page, RED)
    const start = await findPaperPixel(page, 500, 500)
    await mouseStroke(page, start, { x: start.x + 40, y: start.y })
    await settleCanvas(page)
    expect((await readPixel(page, start.x, start.y)).a, 'painting still works').toBeGreaterThan(200)
    await expect(page.locator(SEL.saveStatus)).toHaveClass(/is-error/, { timeout: 15_000 })

    // Expected network/storage errors only; no unhandled exceptions.
    expect(issues.filter((issue) => issue.startsWith('pageerror:'))).toEqual([])
  })

  test('keeps undo history bounded instead of growing without limit', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'dinosaurs-5')
    await selectTool(page, 'pencil')
    await selectColor(page, BLUE)

    const start = await findPaperPixel(page, 420, 420)
    const totalStrokes = 70
    for (let i = 0; i < totalStrokes; i++) {
      const y = start.y + (i % 10) * 6
      const x = start.x + Math.floor(i / 10) * 6
      await mouseStroke(page, { x, y }, { x: x + 14, y }, 2)
    }
    await settleCanvas(page)

    let undos = 0
    for (let i = 0; i < totalStrokes + 5; i++) {
      if (await page.getByTestId('undo').isDisabled()) break
      await undo(page)
      undos++
    }
    await settleCanvas(page)

    expect(undos, 'history keeps a bounded number of entries').toBeGreaterThanOrEqual(50)
    expect(undos, 'history does not grow unbounded past the entry cap').toBeLessThanOrEqual(61)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('cancelled touch gesture leaves a consistent, recoverable state', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'dinosaurs-6')
    await selectColor(page, BLUE)

    const start = await findPaperPixel(page, 500, 500)
    await touchCancelStroke(page, start, { x: start.x + 120, y: start.y })
    await settleCanvas(page)

    const painted = await readPixel(page, start.x, start.y)
    const committed = painted.a > 0
    test.info().annotations.push({
      type: 'touch-cancel',
      description: `pointercancel ${committed ? 'committed the partial stroke' : 'discarded the stroke'}; alpha=${painted.a}`,
    })

    if (committed) {
      await expect(page.getByTestId('undo')).toBeEnabled()
      await undo(page)
      await settleCanvas(page)
      expect((await readPixel(page, start.x, start.y)).a, 'undo removes a cancelled stroke').toBe(0)
    } else {
      expect(painted.a).toBe(0)
    }

    // Input must keep working after a cancellation.
    await mouseStroke(page, start, { x: start.x + 40, y: start.y + 20 })
    await settleCanvas(page)
    expect((await readPixel(page, start.x, start.y)).a).toBeGreaterThan(200)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })
})
