import { expect, type Page } from '@playwright/test'

/** Internal painting resolution used by src/engine/painting-engine.ts. */
export const WORK = 1024

export const SEL = {
  canvas: '[data-testid="drawing-canvas"]',
  canvasHost: '[data-testid="canvas-host"]',
  studio: '[data-testid="studio"]',
  loading: '[data-loading]',
  loadError: '[data-load-error]',
  packGrid: '[data-testid="pack-grid"]',
  drawingGrid: '[data-testid="drawing-grid"]',
  saveStatus: '[data-testid="save-status"]',
  undo: '[data-testid="undo"]',
  redo: '[data-testid="redo"]',
  clear: '[data-testid="clear"]',
  export: '[data-testid="export"]',
  palette: '[data-testid="palette"]',
  toolGrid: '[data-testid="tool-grid"]',
  sizeRange: '[data-testid="size-range"]',
  storageBanner: '[data-storage-banner]',
  clearDialog: '[data-clear-dialog]',
  toast: '[data-toast-host] .toast',
} as const

export const TOOL_IDS = ['brush', 'pencil', 'marker', 'crayon', 'fill', 'eraser'] as const
export type ToolId = (typeof TOOL_IDS)[number]

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Collects real page errors and console errors for a clean-console assertion. */
export function collectPageIssues(page: Page): string[] {
  const issues: string[] = []
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console.error: ${message.text()}`)
  })
  return issues
}

export async function openHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('pack-grid')).toBeVisible()
}

export async function openPack(page: Page, packId: string): Promise<void> {
  await page.getByTestId(`pack-card-${packId}`).click()
  await expect(page.getByTestId('drawing-grid')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#/pack/${packId}$`))
}

export async function openDrawing(page: Page, drawingId: string, packId?: string): Promise<void> {
  // Drawing ids are `${packId}-${n}`; derive the pack so callers cannot open a
  // card inside the wrong pack by forgetting the third argument.
  const targetPack = packId ?? drawingId.replace(/-\d+$/, '')
  if (!page.url().includes(`#/pack/${targetPack}`)) {
    await openHome(page)
    await openPack(page, targetPack)
  }
  await page.getByTestId(`drawing-card-${drawingId}`).click()
  await expect(page.getByTestId('studio')).toBeVisible()
  await expect(page.locator(SEL.canvas)).toBeVisible()
  await expect(page.locator(SEL.loading)).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`#/draw/${drawingId}$`))
}

export async function openDrawingDirect(page: Page, drawingId: string): Promise<void> {
  // A hash-only page.goto() is a same-document navigation: the app would keep
  // its boot-time snapshot of IndexedDB. Always force a real document load so
  // records seeded after boot are read, like a user opening the link afresh.
  const target = `/#/draw/${drawingId}`
  if (!page.url().endsWith(target)) {
    await page.goto(target, { waitUntil: 'domcontentloaded' })
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('studio')).toBeVisible()
  await expect(page.locator(SEL.canvas)).toBeVisible()
  await expect(page.locator(SEL.loading)).toHaveCount(0)
}

export async function canvasBox(page: Page): Promise<Box> {
  const box = await page.locator(SEL.canvas).boundingBox()
  if (!box || box.width < 2 || box.height < 2) throw new Error('canvas has no usable box')
  return box
}

/** Maps internal canvas coordinates (0..WORK) to client/CSS coordinates. */
export function toClient(box: Box, x: number, y: number): { x: number; y: number } {
  return {
    x: box.x + (x / WORK) * box.width,
    y: box.y + (y / WORK) * box.height,
  }
}

/** Maps client/CSS coordinates back to internal canvas coordinates. */
export function toCanvas(box: Box, clientX: number, clientY: number): { x: number; y: number } {
  return {
    x: ((clientX - box.x) / box.width) * WORK,
    y: ((clientY - box.y) / box.height) * WORK,
  }
}

export async function readPixel(page: Page, x: number, y: number): Promise<Rgba> {
  const px = Math.max(0, Math.min(WORK - 1, Math.round(x)))
  const py = Math.max(0, Math.min(WORK - 1, Math.round(y)))
  const [r, g, b, a] = await page.evaluate(
    ([cx, cy]) => {
      const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('canvas missing')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      const data = ctx.getImageData(cx as number, cy as number, 1, 1).data
      return [data[0], data[1], data[2], data[3]]
    },
    [px, py],
  )
  return { r, g, b, a }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

export function isColorClose(actual: Rgba, hex: string, tolerance = 24): boolean {
  const expected = hexToRgb(hex)
  return (
    actual.a > 200 &&
    Math.abs(actual.r - expected.r) <= tolerance &&
    Math.abs(actual.g - expected.g) <= tolerance &&
    Math.abs(actual.b - expected.b) <= tolerance
  )
}

/** Counts displayed pixels close to `hex` and how many pixels are dark linework. */
export async function canvasStats(
  page: Page,
  hex: string,
  tolerance = 24,
): Promise<{ color: number; dark: number; opaque: number; total: number }> {
  const expected = hexToRgb(hex)
  return page.evaluate(
    ([er, eg, eb, tol]) => {
      const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('canvas missing')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let color = 0
      let dark = 0
      let opaque = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        if (a > 200) opaque++
        if (a > 200 && Math.abs(r - er) <= tol && Math.abs(g - eg) <= tol && Math.abs(b - eb) <= tol) color++
        if (a > 200 && 0.2126 * r + 0.7152 * g + 0.0722 * b < 110) dark++
      }
      return { color, dark, opaque, total: canvas.width * canvas.height }
    },
    [expected.r, expected.g, expected.b, tolerance] as const,
  )
}

/** Nearest fully transparent (paper) pixel around a target, in internal coords. */
export async function findPaperPixel(
  page: Page,
  targetX: number,
  targetY: number,
  radius = 70,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([tx, ty, rad]) => {
      const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('canvas missing')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      const t = { x: tx as number, y: ty as number }
      const r = rad as number
      const x0 = Math.max(0, Math.min(canvas.width - 1, Math.round(t.x - r)))
      const y0 = Math.max(0, Math.min(canvas.height - 1, Math.round(t.y - r)))
      const w = Math.max(1, Math.min(canvas.width - x0, r * 2))
      const h = Math.max(1, Math.min(canvas.height - y0, r * 2))
      const { data } = ctx.getImageData(x0, y0, w, h)
      let best: { x: number; y: number } | null = null
      let bestDistance = Number.POSITIVE_INFINITY
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] !== 0) continue
          const dx = x0 + x - t.x
          const dy = y0 + y - t.y
          const distance = dx * dx + dy * dy
          if (distance < bestDistance) {
            bestDistance = distance
            best = { x: x0 + x, y: y0 + y }
          }
        }
      }
      if (!best) throw new Error('no paper pixel near target')
      return best
    },
    [targetX, targetY, radius] as const,
  )
}

export interface PaintedComponent {
  size: number
  components: number
  touchesBorder: boolean
  centroidX: number
  centroidY: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Analyses the connected components of one colour on the displayed canvas.
 * A correct bucket fill produces exactly one component that never reaches the
 * canvas border; a leak through broken linework reaches the border.
 */
export async function paintedComponent(
  page: Page,
  hex: string,
  tolerance = 24,
): Promise<PaintedComponent> {
  const expected = hexToRgb(hex)
  return page.evaluate(
    ([er, eg, eb, tol]) => {
      const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('canvas missing')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      const width = canvas.width
      const height = canvas.height
      const { data } = ctx.getImageData(0, 0, width, height)
      const mask = new Uint8Array(width * height)
      let total = 0
      for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
        if (
          data[p + 3] > 60 &&
          Math.abs(data[p] - er) <= tol &&
          Math.abs(data[p + 1] - eg) <= tol &&
          Math.abs(data[p + 2] - eb) <= tol
        ) {
          mask[i] = 1
          total++
        }
      }
      const stack = new Int32Array(total)
      let components = 0
      let size = 0
      let touchesBorder = false
      let sumX = 0
      let sumY = 0
      let minX = width
      let minY = height
      let maxX = -1
      let maxY = -1
      let bestSize = 0
      let bestSumX = 0
      let bestSumY = 0
      let bestMinX = 0
      let bestMinY = 0
      let bestMaxX = 0
      let bestMaxY = 0
      let bestBorder = false
      const visited = new Uint8Array(width * height)
      for (let start = 0; start < mask.length; start++) {
        if (mask[start] === 0 || visited[start] === 1) continue
        components++
        let head = 0
        let tail = 0
        stack[tail++] = start
        visited[start] = 1
        let compSize = 0
        let compSumX = 0
        let compSumY = 0
        let compMinX = width
        let compMinY = height
        let compMaxX = -1
        let compMaxY = -1
        let compBorder = false
        while (head < tail) {
          const index = stack[head++]
          const x = index % width
          const y = (index - x) / width
          compSize++
          compSumX += x
          compSumY += y
          if (x < compMinX) compMinX = x
          if (x > compMaxX) compMaxX = x
          if (y < compMinY) compMinY = y
          if (y > compMaxY) compMaxY = y
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) compBorder = true
          if (x > 0 && mask[index - 1] && !visited[index - 1]) {
            visited[index - 1] = 1
            stack[tail++] = index - 1
          }
          if (x < width - 1 && mask[index + 1] && !visited[index + 1]) {
            visited[index + 1] = 1
            stack[tail++] = index + 1
          }
          if (y > 0 && mask[index - width] && !visited[index - width]) {
            visited[index - width] = 1
            stack[tail++] = index - width
          }
          if (y < height - 1 && mask[index + width] && !visited[index + width]) {
            visited[index + width] = 1
            stack[tail++] = index + width
          }
        }
        if (compSize > bestSize) {
          bestSize = compSize
          bestSumX = compSumX
          bestSumY = compSumY
          bestMinX = compMinX
          bestMinY = compMinY
          bestMaxX = compMaxX
          bestMaxY = compMaxY
          bestBorder = compBorder
        }
      }
      size = bestSize
      sumX = bestSumX
      sumY = bestSumY
      minX = bestMinX
      minY = bestMinY
      maxX = bestMaxX
      maxY = bestMaxY
      touchesBorder = bestBorder
      return {
        size,
        components,
        touchesBorder,
        centroidX: size > 0 ? sumX / size : -1,
        centroidY: size > 0 ? sumY / size : -1,
        minX,
        minY,
        maxX,
        maxY,
      }
    },
    [expected.r, expected.g, expected.b, tolerance] as const,
  )
}

/**
 * Aggregates EVERY connected component of one colour on the displayed canvas.
 *
 * The locked line art is composited above the colour layer, so a stroke that
 * crosses a line is split into two or more disconnected colour regions.
 * `paintedComponent` returns only the largest one; geometry assertions that
 * must cover the whole gesture (centroid, bbox) need this aggregated view.
 */
export async function paintedRegion(
  page: Page,
  hex: string,
  tolerance = 24,
): Promise<{
  size: number
  components: number
  touchesBorder: boolean
  centroidX: number
  centroidY: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}> {
  const expected = hexToRgb(hex)
  return page.evaluate(
    ([er, eg, eb, tol]) => {
      const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('canvas missing')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      const width = canvas.width
      const height = canvas.height
      const { data } = ctx.getImageData(0, 0, width, height)
      const mask = new Uint8Array(width * height)
      let total = 0
      for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
        if (
          data[p + 3] > 60 &&
          Math.abs(data[p] - er) <= tol &&
          Math.abs(data[p + 1] - eg) <= tol &&
          Math.abs(data[p + 2] - eb) <= tol
        ) {
          mask[i] = 1
          total++
        }
      }
      const visited = new Uint8Array(width * height)
      const stack = new Int32Array(total)
      let components = 0
      let size = 0
      let sumX = 0
      let sumY = 0
      let minX = width
      let minY = height
      let maxX = -1
      let maxY = -1
      let touchesBorder = false
      for (let start = 0; start < mask.length; start++) {
        if (mask[start] === 0 || visited[start] === 1) continue
        components++
        let head = 0
        let tail = 0
        stack[tail++] = start
        visited[start] = 1
        while (head < tail) {
          const index = stack[head++]
          const x = index % width
          const y = (index - x) / width
          size++
          sumX += x
          sumY += y
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true
          if (x > 0 && mask[index - 1] && !visited[index - 1]) {
            visited[index - 1] = 1
            stack[tail++] = index - 1
          }
          if (x < width - 1 && mask[index + 1] && !visited[index + 1]) {
            visited[index + 1] = 1
            stack[tail++] = index + 1
          }
          if (y > 0 && mask[index - width] && !visited[index - width]) {
            visited[index - width] = 1
            stack[tail++] = index - width
          }
          if (y < height - 1 && mask[index + width] && !visited[index + width]) {
            visited[index + width] = 1
            stack[tail++] = index + width
          }
        }
      }
      return {
        size,
        components,
        touchesBorder,
        centroidX: size > 0 ? sumX / size : -1,
        centroidY: size > 0 ? sumY / size : -1,
        minX,
        minY,
        maxX,
        maxY,
      }
    },
    [expected.r, expected.g, expected.b, tolerance] as const,
  )
}

/** Nearest dark linework pixel to a target, in internal coordinates. */
export async function findLinePixel(
  page: Page,
  targetX: number,
  targetY: number,
  radius = 80,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([tx, ty, rad]) => {
      const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('canvas missing')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      const r = rad as number
      const x0 = Math.max(0, Math.min(canvas.width - 1, Math.round((tx as number) - r)))
      const y0 = Math.max(0, Math.min(canvas.height - 1, Math.round((ty as number) - r)))
      const w = Math.max(1, Math.min(canvas.width - x0, r * 2))
      const h = Math.max(1, Math.min(canvas.height - y0, r * 2))
      const { data } = ctx.getImageData(x0, y0, w, h)
      let best: { x: number; y: number } | null = null
      let bestDistance = Number.POSITIVE_INFINITY
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = (y * w + x) * 4
          if (data[p + 3] < 200) continue
          const luminance = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
          if (luminance >= 110) continue
          const dx = x0 + x - (tx as number)
          const dy = y0 + y - (ty as number)
          const distance = dx * dx + dy * dy
          if (distance < bestDistance) {
            bestDistance = distance
            best = { x: x0 + x, y: y0 + y }
          }
        }
      }
      if (!best) throw new Error('no linework pixel near target')
      return best
    },
    [targetX, targetY, radius] as const,
  )
}

/** Waits for the engine's requestAnimationFrame render to land on the canvas. */
export async function settleCanvas(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

export async function selectTool(page: Page, tool: ToolId): Promise<void> {
  await page.locator(`[data-tool="${tool}"]`).click()
  await expect(page.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed', 'true')
}

export async function selectColor(page: Page, hex: string): Promise<void> {
  await page.locator(`[data-color="${hex}"]`).click()
  await expect(page.locator(`[data-color="${hex}"]`)).toHaveAttribute('aria-pressed', 'true')
}

/** Glitter is a finish applied to brushes and the bucket, not a tool. */
export async function selectGlitter(page: Page): Promise<void> {
  await page.getByTestId('palette-glitter').click()
  await expect(page.getByTestId('palette-glitter')).toHaveAttribute('aria-pressed', 'true')
}

/**
 * Counts pixels inside an internal-coordinate rectangle: how many are opaque,
 * how many are close to the base colour and how many are glitter sparkles
 * (channels clearly lighter than the base colour).
 */
export async function sparkleStats(
  page: Page,
  hex: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<{ opaque: number; base: number; light: number; dark: number; distinctLight: number }> {
  const expected = hexToRgb(hex)
  return page.evaluate(
    ([er, eg, eb, x, y, w, h]) => {
      const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLCanvasElement | null
      if (!canvas) throw new Error('canvas missing')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      const { data } = ctx.getImageData(x as number, y as number, w as number, h as number)
      let opaque = 0
      let base = 0
      let light = 0
      let dark = 0
      const lightKeys = new Set<number>()
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue
        opaque++
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (
          Math.abs(r - (er as number)) <= 18 &&
          Math.abs(g - (eg as number)) <= 18 &&
          Math.abs(b - (eb as number)) <= 18
        ) {
          base++
        } else if (
          (r - (er as number) + (g - (eg as number)) + (b - (eb as number))) / 3 > 25
        ) {
          light++
          lightKeys.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3))
        } else {
          dark++
        }
      }
      return { opaque, base, light, dark, distinctLight: lightKeys.size }
    },
    [expected.r, expected.g, expected.b, rect.x, rect.y, rect.width, rect.height] as const,
  )
}

/** Real mouse gesture: pointerdown, several pointermoves, pointerup. */
export async function mouseStroke(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
): Promise<void> {
  const box = await canvasBox(page)
  const start = toClient(box, from.x, from.y)
  const end = toClient(box, to.x, to.y)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await page.mouse.move(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)
  }
  await page.mouse.up()
}

/** Real mouse tap (fill bucket, single click). */
export async function mouseTap(page: Page, x: number, y: number): Promise<void> {
  const box = await canvasBox(page)
  const point = toClient(box, x, y)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.up()
}

export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.locator(SEL.saveStatus)).toHaveClass(/is-saved/, { timeout: 15_000 })
}

export async function undo(page: Page): Promise<void> {
  await page.getByTestId('undo').click()
}

export async function redo(page: Page): Promise<void> {
  await page.getByTestId('redo').click()
}

export async function clearWithConfirm(page: Page): Promise<void> {
  await page.getByTestId('clear').click()
  const dialog = page.locator(SEL.clearDialog)
  await expect(dialog).toHaveAttribute('open', '')
  await dialog.locator('button[value="confirm"]').click()
  await expect(dialog).not.toHaveAttribute('open', '')
}

export async function goBackToPack(page: Page): Promise<void> {
  await page.locator('[data-action="back"]').click()
  await expect(page.getByTestId('drawing-grid')).toBeVisible()
}

export interface StoredRecordInfo {
  id: string
  updatedAt: number
  blobSize: number
  thumbSize: number | null
  width: number
  height: number
}

/** Reads the real IndexedDB records (not localStorage / storageState). */
export async function readStoredRecords(page: Page): Promise<StoredRecordInfo[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('coloring-web')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('open failed'))
    })
    try {
      if (!db.objectStoreNames.contains('drawings')) return []
      const records = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction('drawings', 'readonly')
        const request = tx.objectStore('drawings').getAll()
        request.onsuccess = () => resolve(request.result as unknown[])
        request.onerror = () => reject(request.error ?? new Error('getAll failed'))
      })
      return records.map((raw) => {
        const record = raw as {
          id: string
          updatedAt: number
          blob: Blob
          thumbnail: Blob | null
          width: number
          height: number
        }
        return {
          id: record.id,
          updatedAt: record.updatedAt,
          blobSize: record.blob?.size ?? 0,
          thumbSize: record.thumbnail ? record.thumbnail.size : null,
          width: record.width,
          height: record.height,
        }
      })
    } finally {
      db.close()
    }
  })
}

/** Writes a record directly, used to simulate a corrupt/partial saved painting. */
export async function seedRecord(
  page: Page,
  record: { id: string; blob: Blob; thumbnail?: Blob | null },
): Promise<void> {
  await page.evaluate(async (payload) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('coloring-web', 1)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('drawings')) {
          database.createObjectStore('drawings', { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('open failed'))
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drawings', 'readwrite')
        tx.objectStore('drawings').put({
          id: payload.id,
          blob: payload.blob,
          thumbnail: payload.thumbnail ?? null,
          updatedAt: Date.now(),
          width: 1024,
          height: 1024,
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('put failed'))
      })
    } finally {
      db.close()
    }
  }, record)
}

export async function deleteRecord(page: Page, id: string): Promise<void> {  await page.evaluate(async (drawingId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('coloring-web')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('open failed'))
    })
    try {
      if (!db.objectStoreNames.contains('drawings')) return
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drawings', 'readwrite')
        tx.objectStore('drawings').delete(drawingId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('delete failed'))
      })
    } finally {
      db.close()
    }
  }, id)
}

/** Decodes the stored colour-layer blob from IndexedDB and samples one pixel. */
export async function readStoredPixel(
  page: Page,
  id: string,
  x: number,
  y: number,
): Promise<Rgba | null> {
  return page.evaluate(
    async ([drawingId, px, py]) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('coloring-web')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('open failed'))
      })
      try {
        if (!db.objectStoreNames.contains('drawings')) return null
        const record = await new Promise<{ blob?: Blob } | undefined>((resolve, reject) => {
          const tx = db.transaction('drawings', 'readonly')
          const request = tx.objectStore('drawings').get(drawingId as string)
          request.onsuccess = () => resolve(request.result as { blob?: Blob } | undefined)
          request.onerror = () => reject(request.error ?? new Error('get failed'))
        })
        if (!record?.blob) return null
        const bitmap = await createImageBitmap(record.blob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(bitmap, 0, 0)
        const data = ctx.getImageData(px as number, py as number, 1, 1).data
        return { r: data[0], g: data[1], b: data[2], a: data[3] }
      } finally {
        db.close()
      }
    },
    [id, Math.round(x), Math.round(y)] as const,
  )
}
