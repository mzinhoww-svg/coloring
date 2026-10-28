import {
  TOOLS,
  drawStamp,
  isBufferedTool,
  stampSpacing,
  strokeAlpha,
  toolRadius,
  type StrokePoint,
  type PaintFinish,
  type ToolId,
} from './brushes'
import { composeFinishOverlay, glitterTile } from './finish'
import { clientToCanvas, type Point } from './geometry'
import { PatchHistory, type Patch } from './history'
import { stripPaperWhite } from './line-art'
import { canvasToPngBlob } from '../storage/snapshot'
import {
  buildBoundaryMask,
  dilateMask,
  floodFillRegion,
  hexToRgb,
  paintRegionBox,
  paintGlitterRegionBox,
  regionBox,
} from './region'

export const WORK_SIZE = 1024

export type SoundId = 'stroke' | 'fill' | 'undo' | 'redo' | 'clear' | 'save'

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
}

export interface EngineCallbacks {
  onHistoryChange?: (state: HistoryState) => void
  /** Fired after every committed action that changes saved pixels. */
  onDirty?: (reason: 'stroke' | 'fill' | 'clear' | 'undo' | 'redo') => void
  onSound?: (sound: SoundId) => void
}

interface ActiveStroke {
  pointerId: number
  tool: ToolId
  color: string
  finish: PaintFinish
  size: number
  last: StrokePoint
  before: ImageData
  minX: number
  minY: number
  maxX: number
  maxY: number
  seed: number
  /** Area whose glitter overlay is stale since the last refresh. */
  glitterDirty: Bounds | null
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível renderizar a arte deste desenho.'))
    image.src = src
  })
}

function clampBounds(bounds: Bounds, width: number, height: number): Bounds | null {
  const minX = Math.max(0, Math.floor(bounds.minX))
  const minY = Math.max(0, Math.floor(bounds.minY))
  const maxX = Math.min(width - 1, Math.ceil(bounds.maxX))
  const maxY = Math.min(height - 1, Math.ceil(bounds.maxY))
  if (maxX < minX || maxY < minY) return null
  return { minX, minY, maxX, maxY }
}

function cropImageData(
  source: ImageData,
  bounds: Bounds,
  sourceWidth: number,
): Uint8ClampedArray {
  const width = bounds.maxX - bounds.minX + 1
  const height = bounds.maxY - bounds.minY + 1
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceStart = ((bounds.minY + y) * sourceWidth + bounds.minX) * 4
    out.set(source.data.subarray(sourceStart, sourceStart + width * 4), y * width * 4)
  }
  return out
}

/**
 * Layered Canvas2D painting surface:
 *
 *   display = colour layer + live stroke + locked line art
 *
 * Only the colour layer is ever painted. Fill boundaries always come from the
 * freshly rasterised original line art, so painting can never eat the lines
 * and later fills keep the same shape.
 */
export class PaintingEngine {
  readonly canvas: HTMLCanvasElement

  private readonly width: number
  private readonly height: number
  private readonly colorCanvas: HTMLCanvasElement
  private readonly lineCanvas: HTMLCanvasElement
  private readonly bufferCanvas: HTMLCanvasElement
  private readonly glitterCanvas: HTMLCanvasElement
  private readonly glitterMaskCanvas: HTMLCanvasElement
  private readonly displayCtx: CanvasRenderingContext2D
  private readonly colorCtx: CanvasRenderingContext2D
  private readonly lineCtx: CanvasRenderingContext2D
  private readonly bufferCtx: CanvasRenderingContext2D
  private readonly glitterCtx: CanvasRenderingContext2D
  private readonly glitterMaskCtx: CanvasRenderingContext2D
  private readonly history = new PatchHistory()
  private readonly callbacks: EngineCallbacks

  private boundary: Uint8Array | null = null
  private active: ActiveStroke | null = null
  private frame = 0
  private destroyed = false
  private loaded = false
  private saveCounter = 0

  tool: ToolId = 'brush'
  color = '#e85d78'
  finish: PaintFinish = 'solid'
  size = 16

  constructor(host: HTMLElement, callbacks: EngineCallbacks = {}, width = WORK_SIZE, height = WORK_SIZE) {
    this.width = width
    this.height = height
    this.callbacks = callbacks

    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.className = 'drawing-canvas'
    this.canvas.dataset.testid = 'drawing-canvas'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('role', 'img')
    this.canvas.setAttribute(
      'aria-label',
      'Área de desenho. Use os botões de ferramenta e as cores para pintar.',
    )
    host.appendChild(this.canvas)

    this.colorCanvas = document.createElement('canvas')
    this.colorCanvas.width = width
    this.colorCanvas.height = height
    this.lineCanvas = document.createElement('canvas')
    this.lineCanvas.width = width
    this.lineCanvas.height = height
    this.bufferCanvas = document.createElement('canvas')
    this.bufferCanvas.width = width
    this.bufferCanvas.height = height
    this.glitterCanvas = document.createElement('canvas')
    this.glitterCanvas.width = width
    this.glitterCanvas.height = height
    this.glitterMaskCanvas = document.createElement('canvas')
    this.glitterMaskCanvas.width = width
    this.glitterMaskCanvas.height = height

    const display = this.canvas.getContext('2d')
    const color = this.colorCanvas.getContext('2d', { willReadFrequently: true })
    const line = this.lineCanvas.getContext('2d', { willReadFrequently: true })
    const buffer = this.bufferCanvas.getContext('2d', { willReadFrequently: true })
    const glitter = this.glitterCanvas.getContext('2d')
    const glitterMask = this.glitterMaskCanvas.getContext('2d', { willReadFrequently: true })
    if (!display || !color || !line || !buffer || !glitter || !glitterMask) {
      throw new Error('Este navegador não oferece Canvas 2D.')
    }
    this.displayCtx = display
    this.colorCtx = color
    this.lineCtx = line
    this.bufferCtx = buffer
    this.glitterCtx = glitter
    this.glitterMaskCtx = glitterMask

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerUp)
    this.canvas.addEventListener('lostpointercapture', this.handleLostCapture)
    this.updateCursor()
  }

  get historyState(): HistoryState {
    return { canUndo: this.history.canUndo, canRedo: this.history.canRedo }
  }

  get isReady(): boolean {
    return this.loaded
  }

  get isLoading(): boolean {
    return !this.loaded
  }

  setTool(tool: ToolId): void {
    this.tool = tool
    this.updateCursor()
  }

  setColor(color: string): void {
    this.color = color
  }

  setFinish(finish: PaintFinish): void {
    this.finish = finish
  }

  setSize(size: number): void {
    this.size = Math.max(2, Math.min(64, size))
  }

  /**
   * Rasterises the SVG line-art and restores a previously saved colour layer.
   * The engine is intentionally not usable until this resolves.
   */
  async load(svg: string, savedColor: Blob | null): Promise<void> {
    this.finishStroke(false)
    this.loaded = false
    this.canvas.classList.add('is-loading')
    this.history.clear()
    this.boundary = null
    this.colorCtx.clearRect(0, 0, this.width, this.height)
    this.bufferCtx.clearRect(0, 0, this.width, this.height)
    this.clearGlitterLayers()
    this.lineCtx.clearRect(0, 0, this.width, this.height)

    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    try {
      const image = await loadImage(svgUrl)
      this.lineCtx.clearRect(0, 0, this.width, this.height)
      this.lineCtx.drawImage(image, 0, 0, this.width, this.height)
    } finally {
      URL.revokeObjectURL(svgUrl)
    }

    const linePixels = this.lineCtx.getImageData(0, 0, this.width, this.height)
    stripPaperWhite(linePixels.data, 240)
    this.lineCtx.putImageData(linePixels, 0, 0)
    this.boundary = dilateMask(
      buildBoundaryMask(linePixels.data, this.width, this.height, {
        minAlpha: 20,
        luminanceThreshold: 200,
      }),
      this.width,
      this.height,
      1,
    )

    if (savedColor) {
      const url = URL.createObjectURL(savedColor)
      try {
        const saved = await loadImage(url)
        this.colorCtx.drawImage(saved, 0, 0, this.width, this.height)
      } finally {
        URL.revokeObjectURL(url)
      }
    }

    this.loaded = true
    this.canvas.classList.remove('is-loading')
    this.emitHistory()
    this.renderNow()
  }

  undo(): boolean {
    if (this.active) return false
    const patch = this.history.undo()
    if (!patch) return false
    this.applyPatch(patch, 'before')
    this.emitHistory()
    this.callbacks.onDirty?.('undo')
    this.callbacks.onSound?.('undo')
    this.scheduleRender()
    return true
  }

  redo(): boolean {
    if (this.active) return false
    const patch = this.history.redo()
    if (!patch) return false
    this.applyPatch(patch, 'after')
    this.emitHistory()
    this.callbacks.onDirty?.('redo')
    this.callbacks.onSound?.('redo')
    this.scheduleRender()
    return true
  }

  /** Clears all colour, leaving a full-canvas undo entry. */
  clear(): void {
    if (!this.loaded) return
    this.finishStroke(false)
    const before = this.colorCtx.getImageData(0, 0, this.width, this.height)
    this.colorCtx.clearRect(0, 0, this.width, this.height)
    const after = new Uint8ClampedArray(this.width * this.height * 4)
    this.history.push({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      before: new Uint8ClampedArray(before.data),
      after,
    })
    this.emitHistory()
    this.callbacks.onDirty?.('clear')
    this.callbacks.onSound?.('clear')
    this.scheduleRender()
  }

  /**
   * PNG of the colour layer, produced synchronously so the caller can open the
   * IndexedDB transaction in the same task as the stroke (see storage/snapshot).
   */
  getColorSnapshot(): Blob {
    return canvasToPngBlob(this.colorCanvas)
  }

  /** Composited preview for the gallery, produced synchronously. */
  getThumbnailSnapshot(size = 384): Blob {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível para miniatura.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(this.colorCanvas, 0, 0, size, size)
    ctx.drawImage(this.lineCanvas, 0, 0, size, size)
    return canvasToPngBlob(canvas)
  }

  /** Full-resolution PNG with an opaque white background. */
  getExportBlob(): Promise<Blob> {
    const canvas = document.createElement('canvas')
    canvas.width = this.width
    canvas.height = this.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return Promise.reject(new Error('Canvas indisponível para exportação.'))
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.drawImage(this.colorCanvas, 0, 0)
    ctx.drawImage(this.lineCanvas, 0, 0)
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Não foi possível exportar o desenho.'))
      }, 'image/png')
    })
  }

  renderNow(): void {
    if (this.frame) {
      cancelAnimationFrame(this.frame)
      this.frame = 0
    }
    const ctx = this.displayCtx
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.drawImage(this.colorCanvas, 0, 0)
    if (this.active && isBufferedTool(this.active.tool)) {
      ctx.save()
      ctx.globalAlpha = strokeAlpha(this.active.tool)
      ctx.drawImage(this.bufferCanvas, 0, 0)
      ctx.restore()
    }
    // Glitter lives on its own overlay so later solid stamps can never cover
    // the sparkles of earlier stamps in the same gesture.
    if (this.active && this.active.finish === 'glitter') {
      ctx.save()
      ctx.globalAlpha = isBufferedTool(this.active.tool) ? strokeAlpha(this.active.tool) : 1
      ctx.drawImage(this.glitterCanvas, 0, 0)
      ctx.restore()
    }
    ctx.drawImage(this.lineCanvas, 0, 0)
  }

  destroy(): void {
    this.destroyed = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp)
    this.canvas.removeEventListener('lostpointercapture', this.handleLostCapture)
    this.active = null
    this.history.clear()
    this.canvas.remove()
  }

  private updateCursor(): void {
    this.canvas.style.cursor =
      this.tool === 'fill' ? 'copy' : this.tool === 'eraser' ? 'cell' : 'crosshair'
  }

  private scheduleRender(): void {
    if (this.frame || this.destroyed) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (!this.destroyed) this.renderNow()
    })
  }

  private emitHistory(): void {
    this.callbacks.onHistoryChange?.(this.historyState)
  }

  private applyPatch(patch: Patch, side: 'before' | 'after'): void {
    const pixels = side === 'before' ? patch.before : patch.after
    const image = new ImageData(
      new Uint8ClampedArray(pixels),
      patch.width,
      patch.height,
    )
    this.colorCtx.putImageData(image, patch.x, patch.y)
  }

  private eventPoint(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect()
    const point = clientToCanvas(
      rect,
      event.clientX,
      event.clientY,
      this.width,
      this.height,
    )
    return { x: point.x, y: point.y }
  }

  private pressure(event: PointerEvent): number {
    if (event.pointerType === 'pen' && event.pressure > 0) return event.pressure
    if (event.pointerType === 'mouse') return 0.5
    return event.pressure > 0 ? event.pressure : 0.5
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.loaded || this.active) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    this.canvas.focus({ preventScroll: true })
    try {
      this.canvas.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best-effort; moves are clamped to the canvas.
    }

    const point = this.eventPoint(event)
    if (this.tool === 'fill') {
      this.fillAt(point)
      return
    }

    const before = this.colorCtx.getImageData(0, 0, this.width, this.height)
    if (isBufferedTool(this.tool)) {
      this.bufferCtx.clearRect(0, 0, this.width, this.height)
    }
    this.clearGlitterLayers()
    this.active = {
      pointerId: event.pointerId,
      tool: this.tool,
      color: this.color,
      finish: this.finish,
      size: this.size,
      last: { x: point.x, y: point.y, pressure: this.pressure(event) },
      before,
      minX: this.width,
      minY: this.height,
      maxX: 0,
      maxY: 0,
      seed: this.saveCounter++ * 101,
      glitterDirty: null,
    }
    this.stampAt(point.x, point.y, this.pressure(event))
    this.refreshGlitter()
    this.callbacks.onSound?.('stroke')
    this.scheduleRender()
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const active = this.active
    if (!active || event.pointerId !== active.pointerId) return
    event.preventDefault()
    const events =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event]
    for (const raw of events.length > 0 ? events : [event]) {
      const point = this.eventPoint(raw)
      this.lineTo(point.x, point.y, this.pressure(raw))
    }
    this.refreshGlitter()
    this.scheduleRender()
  }

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.active || event.pointerId !== this.active.pointerId) return
    event.preventDefault()
    this.finishStroke(true)
    this.scheduleRender()
  }

  private handleLostCapture = (): void => {
    if (this.active) {
      this.finishStroke(true)
      this.scheduleRender()
    }
  }

  private lineTo(x: number, y: number, pressure: number): void {
    const active = this.active
    if (!active) return
    const dx = x - active.last.x
    const dy = y - active.last.y
    const distance = Math.hypot(dx, dy)
    if (distance < 0.15) return
    const spacing = stampSpacing(active.tool, active.size)
    const steps = Math.min(2400, Math.max(1, Math.ceil(distance / spacing)))
    for (let step = 1; step <= steps; step++) {
      const t = step / steps
      const p = active.last.pressure + (pressure - active.last.pressure) * t
      this.stampAt(active.last.x + dx * t, active.last.y + dy * t, p)
    }
    active.last = { x, y, pressure }
  }

  private stampAt(x: number, y: number, pressure: number): void {
    const active = this.active
    if (!active) return
    const target = isBufferedTool(active.tool) ? this.bufferCtx : this.colorCtx
    const seed = active.seed + (x * 13.37 + y * 7.11) / 3
    const result = drawStamp(
      target,
      active.tool,
      x,
      y,
      pressure,
      active.size,
      active.color,
      seed,
    )
    const margin = result.radius * 1.12 + 2
    if (active.finish === 'glitter' && active.tool !== 'eraser') {
      // The mask receives the very same stamp, so the glitter overlay follows
      // the real paint coverage, soft edges included.
      drawStamp(this.glitterMaskCtx, active.tool, x, y, pressure, active.size, '#000', seed)
      const dirty = active.glitterDirty
      active.glitterDirty = {
        minX: Math.min(dirty?.minX ?? x - margin, x - margin),
        minY: Math.min(dirty?.minY ?? y - margin, y - margin),
        maxX: Math.max(dirty?.maxX ?? x + margin, x + margin),
        maxY: Math.max(dirty?.maxY ?? y + margin, y + margin),
      }
    }
    active.minX = Math.min(active.minX, x - margin)
    active.minY = Math.min(active.minY, y - margin)
    active.maxX = Math.max(active.maxX, x + margin)
    active.maxY = Math.max(active.maxY, y + margin)
  }

  /**
   * Re-derives the glitter overlay where the stroke changed: the shared world
   * tile, kept only where the mask says paint landed. Running it per input
   * batch keeps the texture visible while the finger is still moving.
   */
  private refreshGlitter(): void {
    const active = this.active
    if (!active?.glitterDirty) return
    const bounds = clampBounds(active.glitterDirty, this.width, this.height)
    active.glitterDirty = null
    if (!bounds) return
    const width = bounds.maxX - bounds.minX + 1
    const height = bounds.maxY - bounds.minY + 1
    const pixels = this.glitterMaskCtx.getImageData(bounds.minX, bounds.minY, width, height)
    composeFinishOverlay(pixels.data, bounds.minX, bounds.minY, width, height, glitterTile(), pixels.data)
    this.glitterCtx.putImageData(pixels, bounds.minX, bounds.minY)
  }

  private clearGlitterLayers(): void {
    this.glitterCtx.clearRect(0, 0, this.width, this.height)
    this.glitterMaskCtx.clearRect(0, 0, this.width, this.height)
  }

  private finishStroke(commit: boolean): void {
    const active = this.active
    if (!active) return
    if (commit) this.refreshGlitter()
    this.active = null
    if (!commit) {
      this.bufferCtx.clearRect(0, 0, this.width, this.height)
      this.clearGlitterLayers()
      return
    }

    if (isBufferedTool(active.tool)) {
      this.colorCtx.save()
      this.colorCtx.globalAlpha = strokeAlpha(active.tool)
      this.colorCtx.drawImage(this.bufferCanvas, 0, 0)
      this.colorCtx.restore()
      this.bufferCtx.clearRect(0, 0, this.width, this.height)
    }

    // Composite the whole gesture's glitter over the finished stroke in one
    // pass. Buffered tools keep their translucent stroke opacity.
    if (active.finish === 'glitter' && active.tool !== 'eraser') {
      this.colorCtx.save()
      this.colorCtx.globalAlpha = isBufferedTool(active.tool) ? strokeAlpha(active.tool) : 1
      this.colorCtx.drawImage(this.glitterCanvas, 0, 0)
      this.colorCtx.restore()
      this.clearGlitterLayers()
    }

    const bounds = clampBounds(
      {
        minX: active.minX,
        minY: active.minY,
        maxX: active.maxX,
        maxY: active.maxY,
      },
      this.width,
      this.height,
    )
    if (!bounds) return
    const width = bounds.maxX - bounds.minX + 1
    const height = bounds.maxY - bounds.minY + 1
    const after = this.colorCtx.getImageData(bounds.minX, bounds.minY, width, height)
    const before = cropImageData(active.before, bounds, this.width)
    this.history.push({
      x: bounds.minX,
      y: bounds.minY,
      width,
      height,
      before,
      after: new Uint8ClampedArray(after.data),
    })
    this.emitHistory()
    this.callbacks.onDirty?.('stroke')
  }

  private fillAt(point: Point): void {
    if (!this.boundary) return
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(point.x)))
    const y = Math.min(this.height - 1, Math.max(0, Math.floor(point.y)))
    const region = floodFillRegion(this.boundary, this.width, this.height, x, y)
    if (!region) return
    const rgb = hexToRgb(this.color)
    if (!rgb) return
    const box = regionBox(region)
    const before = this.colorCtx.getImageData(box.x, box.y, box.width, box.height)
    const working = new Uint8ClampedArray(before.data)
    if (this.finish === 'glitter') {
      paintGlitterRegionBox(working, box.width, region, box.x, box.y, rgb, glitterTile())
    } else {
      paintRegionBox(working, box.width, region, box.x, box.y, rgb)
    }
    this.colorCtx.putImageData(new ImageData(working, box.width, box.height), box.x, box.y)
    this.history.push({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      before: new Uint8ClampedArray(before.data),
      after: new Uint8ClampedArray(working),
    })
    this.emitHistory()
    this.callbacks.onDirty?.('fill')
    this.callbacks.onSound?.('fill')
    this.scheduleRender()
  }
}

export { TOOLS, toolRadius, type ToolId }
