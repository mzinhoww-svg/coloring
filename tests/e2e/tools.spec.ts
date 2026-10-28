import { expect, test, type Page } from '@playwright/test'
import {
  canvasStats,
  collectPageIssues,
  findLinePixel,
  findPaperPixel,
  mouseStroke,
  mouseTap,
  openDrawing,
  openHome,
  paintedComponent,
  readPixel,
  selectColor,
  selectGlitter,
  selectTool,
  settleCanvas,
  sparkleStats,
  undo,
  type ToolId,
} from './helpers/app'

const STROKE_TOOLS: Array<{ tool: ToolId; color: string; drawing: string }> = [
  { tool: 'brush', color: '#5dcae2', drawing: 'animals-7' },
  { tool: 'pencil', color: '#5cc63a', drawing: 'animals-8' },
  { tool: 'marker', color: '#e7579a', drawing: 'animals-9' },
  { tool: 'crayon', color: '#f9da49', drawing: 'animals-10' },
]

const FILL_BLUE = '#5dcba3'
const FILL_GREEN = '#d3b3f6'
const FILL_PINK = '#e7579a'

/** Raw RGBA pixels of a canvas rectangle, used to prove an exact restore. */
async function readRectPixels(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
): Promise<number[]> {
  return page.evaluate(([x, y, w, h]) => {
    const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLCanvasElement | null
    if (!canvas) throw new Error('canvas missing')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context missing')
    const data = ctx.getImageData(x as number, y as number, w as number, h as number).data
    return Array.from(data)
  }, [rect.x, rect.y, rect.width, rect.height] as const)
}

/**
 * Taps candidates until one produces a bounded (non-background) fill.
 * Reverts with undo only when the tap actually changed the canvas, so a tap
 * that lands on linework cannot silently revert a previous action.
 */
async function fillBoundedRegion(
  page: Page,
  hex: string,
  candidates: Array<{ x: number; y: number }>,
): Promise<{ point: { x: number; y: number }; size: number }> {
  for (const candidate of candidates) {
    const before = (await canvasStats(page, hex)).color
    await mouseTap(page, candidate.x, candidate.y)
    await settleCanvas(page)
    const after = await canvasStats(page, hex)
    const bounded = after.color > 1500 && after.color < 300_000
    if (bounded) {
      const component = await paintedComponent(page, hex)
      if (component.components === 1 && !component.touchesBorder) {
        return { point: candidate, size: component.size }
      }
    }
    if (after.color !== before) {
      await undo(page)
      await settleCanvas(page)
    }
  }
  throw new Error('no bounded fill region found among candidates')
}

test.describe('seven painting tools', () => {
  for (const { tool, color, drawing } of STROKE_TOOLS) {
    test(`${tool} paints a visible stroke in the selected colour`, async ({ page }) => {
      const issues = collectPageIssues(page)
      await openHome(page)
      await openDrawing(page, drawing)
      await selectTool(page, tool)
      await selectColor(page, color)

      const start = await findPaperPixel(page, 470, 470)
      await mouseStroke(page, start, { x: start.x + 60, y: start.y + 30 })
      await settleCanvas(page)

      const component = await paintedComponent(page, color)
      expect(component.size, `${tool} left visible pixels`).toBeGreaterThan(60)
      const pixel = await readPixel(page, start.x, start.y)
      expect(pixel.a, `${tool} pixel is not transparent`).toBeGreaterThan(60)

      await undo(page)
      await settleCanvas(page)
      const afterUndo = await paintedComponent(page, color)
      expect(afterUndo.size, `${tool} stroke is one undo entry`).toBe(0)

      expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
    })
  }

  test('eraser removes colour but keeps the line art', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'animals-12')

    await selectTool(page, 'brush')
    await selectColor(page, '#5dcae2')
    const start = await findPaperPixel(page, 480, 480)
    await mouseStroke(page, start, { x: start.x + 70, y: start.y })
    await settleCanvas(page)
    const painted = await paintedComponent(page, '#5dcae2')
    expect(painted.size).toBeGreaterThan(200)
    const lineBefore = (await canvasStats(page, '#5dcae2')).dark

    await selectTool(page, 'eraser')
    await mouseStroke(page, start, { x: start.x + 70, y: start.y })
    await settleCanvas(page)

    const erased = await readPixel(page, start.x, start.y)
    expect(erased.a, 'erased pixel becomes transparent').toBe(0)
    const remaining = await paintedComponent(page, '#5dcae2')
    expect(remaining.size, 'eraser removed the painted pixels').toBeLessThan(painted.size * 0.25)
    const lineAfter = (await canvasStats(page, '#5dcae2')).dark
    expect(lineAfter, 'line art is untouched by the eraser').toBe(lineBefore)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('bucket fill recolours one closed region, preserves outlines and is stable', async ({
    page,
  }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'animals-13')
    await selectTool(page, 'fill')

    const darkBefore = (await canvasStats(page, FILL_BLUE)).dark
    await selectColor(page, FILL_BLUE)
    const first = await fillBoundedRegion(page, FILL_BLUE, [
      { x: 512, y: 512 },
      { x: 420, y: 470 },
      { x: 600, y: 520 },
      { x: 512, y: 380 },
      { x: 380, y: 560 },
      { x: 640, y: 400 },
    ])
    const firstComponent = await paintedComponent(page, FILL_BLUE)
    expect(firstComponent.components, 'one connected region only').toBe(1)
    expect(firstComponent.touchesBorder, 'fill must not leak to the canvas border').toBe(false)
    expect(first.size).toBe(firstComponent.size)

    const darkAfter = (await canvasStats(page, FILL_BLUE)).dark
    expect(darkAfter, 'linework pixels are unchanged by the fill').toBe(darkBefore)

    // A second, different region must be filled without touching the first.
    await selectColor(page, FILL_GREEN)
    const secondCandidates = [
      { x: 300, y: 300 },
      { x: 700, y: 640 },
      { x: 300, y: 620 },
      { x: 720, y: 300 },
      { x: 250, y: 500 },
      { x: 780, y: 500 },
    ]
    let second: { point: { x: number; y: number }; size: number } | null = null
    for (const candidate of secondCandidates) {
      const beforeGreen = (await canvasStats(page, FILL_GREEN)).color
      await mouseTap(page, candidate.x, candidate.y)
      await settleCanvas(page)
      const green = await canvasStats(page, FILL_GREEN)
      const blue = await canvasStats(page, FILL_BLUE)
      const bounded = green.color > 1500 && green.color < 300_000
      const keptFirst = blue.color === firstComponent.size
      if (bounded && keptFirst) {
        const component = await paintedComponent(page, FILL_GREEN)
        if (component.components === 1 && !component.touchesBorder) {
          second = { point: candidate, size: component.size }
          break
        }
      }
      if (green.color !== beforeGreen || !keptFirst) {
        await undo(page)
        await settleCanvas(page)
      }
    }
    expect(second, 'found a second independent region').not.toBeNull()
    expect((await canvasStats(page, FILL_BLUE)).color, 'first region intact').toBe(
      firstComponent.size,
    )

    // Re-filling the same region with a new colour recolours exactly that area.
    await selectColor(page, FILL_PINK)
    await mouseTap(page, first.point.x, first.point.y)
    await settleCanvas(page)
    const pink = await paintedComponent(page, FILL_PINK)
    expect(
      Math.abs(pink.size - firstComponent.size) / firstComponent.size,
      `recolour size ${pink.size} vs ${firstComponent.size}`,
    ).toBeLessThan(0.05)
    expect((await canvasStats(page, FILL_BLUE)).color, 'old colour fully replaced').toBe(0)
    expect((await canvasStats(page, FILL_GREEN)).color, 'other region untouched').toBe(second.size)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('bucket fill on a linework pixel stays bounded (no canvas-wide leak)', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'animals-14')
    await selectTool(page, 'fill')
    await selectColor(page, FILL_BLUE)

    const line = await findLinePixel(page, 512, 512)
    await mouseTap(page, line.x, line.y)
    await settleCanvas(page)

    const component = await paintedComponent(page, FILL_BLUE)
    const stats = await canvasStats(page, FILL_BLUE)
    test.info().annotations.push({
      type: 'fill-on-line',
      description: `tap=(${line.x},${line.y}) painted=${stats.color} components=${component.components} touchesBorder=${component.touchesBorder}`,
    })
    expect(stats.color, 'tapping a line does not flood the whole canvas').toBeLessThan(400_000)
    expect(component.touchesBorder, 'a tap on linework must not leak into the page background').toBe(
      false,
    )

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('canvas coordinates map correctly on a scaled canvas', async ({ page }) => {
    const issues = collectPageIssues(page)
    await openHome(page)
    await openDrawing(page, 'animals-15')
    await selectTool(page, 'brush')
    await selectColor(page, '#f9da49')

    for (const target of [
      { x: 320, y: 300 },
      { x: 760, y: 700 },
    ]) {
      const paper = await findPaperPixel(page, target.x, target.y, 24)
      await mouseTap(page, paper.x, paper.y)
      await settleCanvas(page)
      const component = await paintedComponent(page, '#f9da49')
      expect(component.size, 'tap painted a dot').toBeGreaterThan(20)
      expect(
        Math.abs(component.centroidX - paper.x),
        `x centroid ${component.centroidX} vs tap ${paper.x}`,
      ).toBeLessThanOrEqual(6)
      expect(
        Math.abs(component.centroidY - paper.y),
        `y centroid ${component.centroidY} vs tap ${paper.y}`,
      ).toBeLessThanOrEqual(6)
      await undo(page)
      await settleCanvas(page)
    }

    // A brush stroke endpoint must land where the pointer stopped.
    const from = await findPaperPixel(page, 500, 500)
    const to = { x: from.x + 120, y: from.y + 90 }
    await mouseStroke(page, from, to)
    await settleCanvas(page)
    const stroke = await paintedComponent(page, '#f9da49')
    expect(Math.abs(stroke.maxX - to.x)).toBeLessThanOrEqual(10)
    expect(Math.abs(stroke.maxY - to.y)).toBeLessThanOrEqual(10)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('glitter finish adds lighter sparkles on top of the brush stroke', async ({ page }) => {
    const issues = collectPageIssues(page)
    const PURPLE = '#db4ff0'
    await openHome(page)
    await openDrawing(page, 'animals-11')
    await selectTool(page, 'brush')
    await selectColor(page, PURPLE)
    await selectGlitter(page)

    const start = await findPaperPixel(page, 470, 470)
    // Generous rectangle covering the stroke and every sparkle. The locked
    // line art inside it is opaque, so the undo check compares against this
    // baseline instead of expecting alpha=0.
    const rect = {
      x: Math.max(0, start.x - 40),
      y: Math.max(0, start.y - 40),
      width: 150,
      height: 100,
    }
    const baseline = await readRectPixels(page, rect)
    const baselineStats = await sparkleStats(page, PURPLE, rect)

    await mouseStroke(page, start, { x: start.x + 70, y: start.y + 20 })
    await settleCanvas(page)

    const component = await paintedComponent(page, PURPLE)
    expect(component.size, 'glitter stroke paints the selected colour').toBeGreaterThan(150)

    const stats = await sparkleStats(page, PURPLE, rect)
    expect(stats.light, 'glitter adds lighter sparkle pixels').toBeGreaterThan(15)
    expect(stats.distinctLight, 'sparkles use several light tones').toBeGreaterThanOrEqual(3)
    expect(stats.light / stats.opaque, 'sparkles are a visible accent, not the whole stroke').toBeLessThan(
      0.5,
    )

    await undo(page)
    await settleCanvas(page)
    const restored = await readRectPixels(page, rect)
    const residual = restored.reduce(
      (count, value, index) => (value !== baseline[index] ? count + 1 : count),
      0,
    )
    expect(residual, 'one undo leaves no paint or glitter pixel behind').toBe(0)

    const afterUndo = await sparkleStats(page, PURPLE, rect)
    expect(afterUndo.opaque, 'no extra opaque paint after undo').toBe(baselineStats.opaque)
    expect(afterUndo.base, 'no selected-colour pixels after undo').toBe(baselineStats.base)
    expect(afterUndo.light, 'no glitter sparkles after undo').toBe(baselineStats.light)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })

  test('glitter bucket fills one bounded region with sparkle texture', async ({ page }) => {
    const issues = collectPageIssues(page)
    const GREEN = '#5cc63a'
    await openHome(page)
    await openDrawing(page, 'animals-11')
    await selectTool(page, 'fill')
    await selectColor(page, GREEN)
    await selectGlitter(page)

    const darkBefore = (await canvasStats(page, GREEN)).dark
    const candidates = [
      { x: 512, y: 512 },
      { x: 430, y: 480 },
      { x: 590, y: 520 },
      { x: 512, y: 390 },
      { x: 360, y: 560 },
    ]
    let chosen: { x: number; y: number } | null = null
    let component = await paintedComponent(page, GREEN)
    for (const candidate of candidates) {
      await mouseTap(page, candidate.x, candidate.y)
      await settleCanvas(page)
      component = await paintedComponent(page, GREEN)
      const painted = (await canvasStats(page, GREEN)).color
      // Glitter texture leaves isolated speckles, so allow more than one
      // component as long as the largest one is the filled region.
      if (
        component.size > 1500 &&
        component.size < 300_000 &&
        component.size > painted * 0.75 &&
        !component.touchesBorder
      ) {
        chosen = candidate
        break
      }
      if (component.size > 0) {
        await undo(page)
        await settleCanvas(page)
      }
    }
    expect(chosen, 'found a bounded region for the glitter bucket').not.toBeNull()
    expect(component.touchesBorder, 'glitter fill never leaks to the canvas border').toBe(false)

    const rect = {
      x: Math.max(0, component.minX - 4),
      y: Math.max(0, component.minY - 4),
      width: component.maxX - component.minX + 8,
      height: component.maxY - component.minY + 8,
    }
    const stats = await sparkleStats(page, GREEN, rect)
    expect(stats.base, 'region is painted in the selected colour').toBeGreaterThan(1500)
    expect(stats.light, 'glitter fill has light sparkles').toBeGreaterThan(40)
    expect(stats.distinctLight, 'sparkle texture is varied').toBeGreaterThanOrEqual(4)
    const ratio = stats.light / stats.opaque
    expect(ratio, `sparkle ratio ${ratio.toFixed(3)}`).toBeGreaterThan(0.005)
    expect(ratio, `sparkle ratio ${ratio.toFixed(3)}`).toBeLessThan(0.35)
    expect((await canvasStats(page, GREEN)).dark, 'linework is untouched').toBe(darkBefore)

    await undo(page)
    await settleCanvas(page)
    expect((await paintedComponent(page, GREEN)).size, 'one undo reverts the glitter fill').toBe(0)

    // The same tap must stay bounded when repeated.
    await mouseTap(page, chosen!.x, chosen!.y)
    await settleCanvas(page)
    const again = await paintedComponent(page, GREEN)
    expect(again.size).toBeGreaterThan(1500)
    expect(again.touchesBorder).toBe(false)

    expect(issues, `console/page errors: ${issues.join(' | ')}`).toEqual([])
  })
})
