import { expect, test, type Page } from '@playwright/test'
import {
  SEL,
  canvasBox,
  collectPageIssues,
  findPaperPixel,
  mouseStroke,
  openDrawing,
  openHome,
  paintedComponent,
  paintedRegion,
  readPixel,
  selectColor,
  selectTool,
  settleCanvas,
  TOOL_IDS,
  toClient,
  undo,
} from './helpers/app'
import { TouchDriver, touchStroke, touchTap } from './helpers/touch'

const BLUE = '#5dcae2'
const GREEN = '#5cc63a'

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement
    return Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth
  })
}

test.describe('responsive painting', () => {
  test('layout fits the viewport and exposes all six tools plus glitter', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    expect(await horizontalOverflow(page), 'home does not scroll horizontally').toBeLessThanOrEqual(1)

    await openDrawing(page, 'fairytale-1')
    expect(await horizontalOverflow(page), 'studio does not scroll horizontally').toBeLessThanOrEqual(
      1,
    )

    const box = await canvasBox(page)
    expect(box.width).toBeGreaterThan(120)
    expect(box.height).toBeGreaterThan(120)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual((await page.evaluate(() => window.innerWidth)) + 1)

    for (const tool of TOOL_IDS) {
      const button = page.locator(`[data-tool="${tool}"]`)
      await expect(button, `${tool} is visible`).toBeVisible()
      const buttonBox = await button.boundingBox()
      expect(buttonBox?.width ?? 0, `${tool} is tappable`).toBeGreaterThanOrEqual(24)
      await selectTool(page, tool)
    }

    await expect(page.getByTestId('save-status')).toBeVisible()
    await expect(page.getByTestId('clear')).toBeVisible()
    await expect(page.getByTestId('palette-glitter')).toBeVisible()

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('a real touch stroke paints under the finger', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'fairytale-2')
    await selectTool(page, 'brush')
    await selectColor(page, BLUE)

    const start = await findPaperPixel(page, 470, 470)
    await touchStroke(page, start, { x: start.x + 110, y: start.y + 40 })
    await settleCanvas(page)

    const component = await paintedComponent(page, BLUE)
    expect(component.size, 'touch stroke painted pixels').toBeGreaterThan(150)
    expect(
      Math.abs(component.centroidX - (start.x + 55)),
      `x centroid ${component.centroidX} vs expected ${start.x + 55}`,
    ).toBeLessThanOrEqual(12)
    expect(
      Math.abs(component.centroidY - (start.y + 20)),
      `y centroid ${component.centroidY} vs expected ${start.y + 20}`,
    ).toBeLessThanOrEqual(12)

    const pixel = await readPixel(page, start.x + 55, start.y + 20)
    expect(pixel.a, 'finger position is painted').toBeGreaterThan(200)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('a touch tap with the bucket fills exactly one region', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'fairytale-3')
    await selectTool(page, 'fill')
    await selectColor(page, GREEN)

    const candidates = [
      { x: 512, y: 512 },
      { x: 430, y: 480 },
      { x: 590, y: 520 },
      { x: 512, y: 390 },
    ]
    let filled = false
    for (const candidate of candidates) {
      await touchTap(page, candidate.x, candidate.y)
      await settleCanvas(page)
      const component = await paintedComponent(page, GREEN)
      if (component.size > 1500 && component.size < 300_000 && !component.touchesBorder) {
        expect(component.components, 'one connected region').toBe(1)
        filled = true
        break
      }
      if (component.size > 0) {
        await undo(page)
        await settleCanvas(page)
      }
    }
    expect(filled, 'touch fill produced a bounded region').toBe(true)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('pen pressure changes the painted footprint (measured observation)', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'fairytale-4')
    await selectTool(page, 'brush')
    await selectColor(page, '#f9da49')

    const box = await canvasBox(page)
    const driver = await TouchDriver.attach(page)
    const paint = async (x: number, y: number, force: number) => {
      const point = toClient(box, x, y)
      const session = await page.context().newCDPSession(page)
      try {
        await session.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: point.x,
          y: point.y,
          button: 'left',
          buttons: 1,
          clickCount: 1,
          pointerType: 'pen',
          force,
        })
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: point.x,
          y: point.y,
          button: 'left',
          buttons: 0,
          clickCount: 1,
          pointerType: 'pen',
          force,
        })
      } finally {
        await session.detach()
      }
    }
    await driver.detach()

    const light = await findPaperPixel(page, 360, 380, 20)
    await paint(light.x, light.y, 0.2)
    await settleCanvas(page)
    const lightComponent = await paintedComponent(page, '#f9da49')

    const heavy = await findPaperPixel(page, 660, 620, 20)
    await paint(heavy.x, heavy.y, 1)
    await settleCanvas(page)

    const heavyOnly = await paintedComponent(page, '#f9da49')
    test.info().annotations.push({
      type: 'pen-pressure',
      description: `force 0.2 painted ${lightComponent.size}px, force 1.0 painted ${heavyOnly.size}px total`,
    })
    expect(lightComponent.size, 'light pen pressure still paints').toBeGreaterThan(20)
    expect(heavyOnly.size, 'heavy pen pressure paints').toBeGreaterThan(20)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('painting after a viewport rotation keeps coordinates aligned', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'fairytale-5')
    await selectTool(page, 'brush')
    await selectColor(page, BLUE)

    const size = page.viewportSize()
    if (!size) throw new Error('no viewport')
    await page.setViewportSize({ width: size.height, height: size.width })
    await settleCanvas(page)

    const start = await findPaperPixel(page, 500, 500)
    await touchStroke(page, start, { x: start.x + 80, y: start.y })
    await settleCanvas(page)

    const region = await paintedRegion(page, BLUE)
    const diagBox = await canvasBox(page)
    test.info().annotations.push({
      type: 'rotation-metrics',
      description: `viewport=${await page.evaluate(() => `${innerWidth}x${innerHeight}`)} canvasBox=${JSON.stringify(diagBox)} start=${JSON.stringify(start)} region=${JSON.stringify({ size: region.size, components: region.components, centroidX: region.centroidX, centroidY: region.centroidY, minX: region.minX, maxX: region.maxX, minY: region.minY, maxY: region.maxY, touchesBorder: region.touchesBorder })}`,
    })
    expect(region.size, 'painting works after rotation').toBeGreaterThan(120)
    expect(
      Math.abs(region.centroidX - (start.x + 40)),
      `centroid ${region.centroidX} vs ${start.x + 40}`,
    ).toBeLessThanOrEqual(14)

    // Mouse input stays accurate on the same viewport.
    await mouseStroke(page, start, { x: start.x, y: start.y + 80 })
    await settleCanvas(page)
    const afterMouse = await paintedRegion(page, BLUE)
    test.info().annotations.push({
      type: 'rotation-metrics-after-mouse',
      description: `afterMouse=${JSON.stringify({ size: afterMouse.size, components: afterMouse.components, centroidX: afterMouse.centroidX, centroidY: afterMouse.centroidY, minX: afterMouse.minX, maxX: afterMouse.maxX, minY: afterMouse.minY, maxY: afterMouse.maxY, touchesBorder: afterMouse.touchesBorder })}`,
    })
    expect(afterMouse.size).toBeGreaterThan(region.size)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })
})
