/** Pointer-to-canvas mapping that is independent of DOM types. */

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface MappedPoint extends Point {
  inside: boolean
}

/**
 * Maps a client (CSS) coordinate to the canvas' internal coordinate space.
 * Works for letterboxed/scaled canvases and never divides by zero.
 */
export function clientToCanvas(
  rect: RectLike,
  clientX: number,
  clientY: number,
  canvasWidth: number,
  canvasHeight: number,
  clamp = true,
): MappedPoint {
  const cssWidth = rect.width || 1
  const cssHeight = rect.height || 1
  let x = ((clientX - rect.left) / cssWidth) * canvasWidth
  let y = ((clientY - rect.top) / cssHeight) * canvasHeight
  const inside = x >= 0 && y >= 0 && x <= canvasWidth && y <= canvasHeight
  if (clamp) {
    x = Math.min(canvasWidth, Math.max(0, x))
    y = Math.min(canvasHeight, Math.max(0, y))
  }
  return { x, y, inside }
}
