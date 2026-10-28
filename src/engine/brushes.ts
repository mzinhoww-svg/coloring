/**
 * Brush stamps. Stroke opacity that must stay even within a single gesture
 * (marker, crayon) is accumulated on an offscreen stroke buffer and
 * composited once by the engine.
 */

export type ToolId = 'brush' | 'pencil' | 'marker' | 'crayon' | 'eraser' | 'fill'
export type PaintFinish = 'solid' | 'glitter'

export const TOOLS: ReadonlyArray<{ id: ToolId; label: string }> = [
  { id: 'brush', label: 'Pincel' },
  { id: 'pencil', label: 'Lápis' },
  { id: 'marker', label: 'Marcador' },
  { id: 'crayon', label: 'Giz de cera' },
  { id: 'fill', label: 'Preenchimento' },
  { id: 'eraser', label: 'Borracha' },
]

export function isBufferedTool(tool: ToolId): boolean {
  return tool === 'marker' || tool === 'crayon'
}

export function strokeAlpha(tool: ToolId): number {
  switch (tool) {
    case 'marker':
      return 0.55
    default:
      return 1
  }
}

export function toolRadius(tool: ToolId, size: number): number {
  const safe = Math.max(1, size)
  switch (tool) {
    case 'pencil':
      return Math.max(0.85, safe * 0.3)
    case 'marker':
      return safe * 0.55
    default:
      return safe * 0.5
  }
}

export function stampSpacing(tool: ToolId, size: number): number {
  if (tool === 'pencil') return 1.05
  return Math.max(1.1, size * 0.14)
}

export function pressureScale(tool: ToolId, pressure: number): number {
  if (tool === 'marker' || tool === 'crayon' || tool === 'fill') return 1
  const p = pressure > 0 ? pressure : 0.5
  return 0.62 + Math.min(1, p) * 0.55
}

function hash(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

export interface StampResult {
  radius: number
}

/**
 * Draws one stamp. `seed` makes texture deterministic for a given point in a
 * gesture so the stroke does not shimmer while it is being drawn.
 */
export function drawStamp(
  ctx: CanvasRenderingContext2D,
  tool: ToolId,
  x: number,
  y: number,
  pressure: number,
  size: number,
  color: string,
  seed: number,
): StampResult {
  const radius = toolRadius(tool, size) * pressureScale(tool, pressure)
  const baseRadius = toolRadius(tool, size)

  switch (tool) {
    case 'brush': {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      return { radius }
    }
    case 'pencil': {
      ctx.fillStyle = color
      ctx.globalAlpha = 0.88
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      // Graphite speckle around the edge.
      ctx.globalAlpha = 0.16
      const a = hash(seed) * Math.PI * 2
      const d = baseRadius * (0.55 + hash(seed + 7) * 0.5)
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.5, baseRadius * 0.3), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      return { radius: baseRadius * 1.05 }
    }
    case 'marker': {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, baseRadius, 0, Math.PI * 2)
      ctx.fill()
      return { radius: baseRadius }
    }
    case 'crayon': {
      const jitterX = (hash(seed) - 0.5) * baseRadius * 0.22
      const jitterY = (hash(seed + 3) - 0.5) * baseRadius * 0.22
      ctx.fillStyle = color
      ctx.globalAlpha = 0.82
      ctx.beginPath()
      ctx.arc(x + jitterX, y + jitterY, baseRadius, 0, Math.PI * 2)
      ctx.fill()
      // Wax satellites give the edge its rough, crayon-like outline.
      ctx.globalAlpha = 0.5
      for (let i = 0; i < 2; i++) {
        const angle = hash(seed + i * 11) * Math.PI * 2
        const distance = baseRadius * (0.7 + hash(seed + i * 17) * 0.4)
        ctx.beginPath()
        ctx.arc(
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
          Math.max(0.6, baseRadius * 0.32),
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      ctx.globalAlpha = 1
      return { radius: baseRadius * 1.25 }
    }
    case 'eraser': {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      return { radius }
    }
    case 'fill':
      return { radius: 0 }
  }
}

export interface StrokePoint {
  x: number
  y: number
  pressure: number
}
