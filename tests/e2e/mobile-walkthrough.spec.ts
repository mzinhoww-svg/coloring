import { expect, test, type Page } from '@playwright/test'
import {
  canvasStats,
  collectPageIssues,
  findPaperPixel,
  openHome,
  openPack,
  paintedComponent,
  selectColor,
  selectGlitter,
  selectTool,
  settleCanvas,
  sparkleStats,
  waitForSaved,
} from './helpers/app'
import { touchStroke, touchTap } from './helpers/touch'

const BLUE = '#5dcae2'
const GREEN = '#5dcba3'

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement
    return Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth
  })
}

test.describe('mobile walkthrough', () => {
  test('touch: home -> gallery -> paint -> glitter bucket -> save -> reopen', async ({ page }) => {
    const issues = collectPageIssues(page)

    await openHome(page)
    expect(await horizontalOverflow(page), 'home has no horizontal scroll').toBeLessThanOrEqual(1)
    await openPack(page, 'fairytale')
    expect(await horizontalOverflow(page), 'gallery has no horizontal scroll').toBeLessThanOrEqual(1)

    await page.getByTestId('drawing-card-fairytale-4').tap()
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator('[data-loading]')).toHaveCount(0)
    expect(await horizontalOverflow(page), 'studio has no horizontal scroll').toBeLessThanOrEqual(1)

    // Every tool and the glitter chip must be reachable on a phone.
    for (const tool of ['brush', 'pencil', 'marker', 'crayon', 'fill', 'eraser'] as const) {
      await selectTool(page, tool)
    }
    await selectTool(page, 'brush')
    await selectColor(page, BLUE)
    await expect(page.getByTestId('palette-glitter')).toBeVisible()

    const start = await findPaperPixel(page, 480, 480)
    await touchStroke(page, start, { x: start.x + 90, y: start.y + 30 })
    await settleCanvas(page)
    expect((await canvasStats(page, BLUE)).color, 'finger painted pixels').toBeGreaterThan(120)

    // Glitter bucket with a real touch tap.
    await selectTool(page, 'fill')
    await selectColor(page, GREEN)
    await selectGlitter(page)
    const candidates = [
      { x: 512, y: 512 },
      { x: 430, y: 480 },
      { x: 590, y: 520 },
      { x: 512, y: 390 },
    ]
    let component = await paintedComponent(page, GREEN)
    for (const candidate of candidates) {
      await touchTap(page, candidate.x, candidate.y)
      await settleCanvas(page)
      component = await paintedComponent(page, GREEN)
      if (component.size > 1500 && !component.touchesBorder) break
      if (component.size > 0) {
        await page.getByTestId('undo').tap()
        await settleCanvas(page)
      }
    }
    expect(component.size, 'touch bucket filled a region').toBeGreaterThan(1500)
    expect(component.touchesBorder, 'touch bucket stays bounded').toBe(false)
    const stats = await sparkleStats(page, GREEN, {
      x: Math.max(0, component.minX - 4),
      y: Math.max(0, component.minY - 4),
      width: component.maxX - component.minX + 8,
      height: component.maxY - component.minY + 8,
    })
    expect(stats.light, 'touch glitter bucket sparkles').toBeGreaterThan(30)

    await waitForSaved(page)
    await page.locator('[data-action="back"]').tap()
    await expect(page.getByTestId('drawing-grid')).toBeVisible()
    await expect(page.getByTestId('drawing-card-fairytale-4').locator('.work-badge')).toBeVisible()

    await page.getByTestId('drawing-card-fairytale-4').tap()
    await expect(page.getByTestId('studio')).toBeVisible()
    await expect(page.locator('[data-loading]')).toHaveCount(0)
    await settleCanvas(page)
    expect(
      (await canvasStats(page, GREEN)).color,
      'touch painting survives reopen',
    ).toBeGreaterThan(component.size * 0.8)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })
})
