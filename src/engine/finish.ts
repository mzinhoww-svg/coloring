/**
 * Paint finishes rendered as world-anchored texture tiles.
 *
 * A finish is an RGBA overlay (straight alpha) composited source-over on top
 * of the base colour, only where paint landed. The tile repeats from the
 * canvas origin, so a brush stroke and a bucket fill over the same pixels show
 * the very same sparkles, overlapping stamps never pile up extra glitter, and
 * repainting an area does not reshuffle it.
 *
 * Everything here is DOM-free so it can be unit tested in Node.
 */

import type { Rgb } from './region'

export interface FinishTile {
  size: number
  /** size × size RGBA overlay with straight (non-premultiplied) alpha. */
  rgba: Uint8ClampedArray
}

export const GLITTER_TILE_SIZE = 192

/** One sparkle candidate per CELL × CELL block keeps the spread even but irregular. */
const CELL = 8
const EMPTY_CELL_SHARE = 0.45

/** Mostly white highlights with a little iridescence, like real glitter flakes. */
const TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 255, 255],
  [255, 255, 255],
  [255, 255, 255],
  [255, 241, 196],
  [216, 240, 255],
  [255, 222, 240],
  [222, 255, 236],
]

/** Facet shadow that gives depth and keeps glitter visible on very light paint. */
const SHADE: readonly [number, number, number] = [34, 30, 58]

function hash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 362437)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Builds a seamless glitter tile: small flecks, plus-shaped star glints and a
 * few bright stars, spread over a jittered grid. Coverage stays well under 15 %
 * so the selected colour remains the dominant colour of the paint.
 */
export function createGlitterTile(size = GLITTER_TILE_SIZE, seed = 1): FinishTile {
  const rgba = new Uint8ClampedArray(size * size * 4)

  const plot = (x: number, y: number, alpha: number, tint: readonly [number, number, number]) => {
    const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    if (a === 0) return
    const wx = ((x % size) + size) % size
    const wy = ((y % size) + size) % size
    const p = (wy * size + wx) * 4
    if (rgba[p + 3] >= a) return
    rgba[p] = tint[0]
    rgba[p + 1] = tint[1]
    rgba[p + 2] = tint[2]
    rgba[p + 3] = a
  }

  const cells = Math.max(1, Math.floor(size / CELL))
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (hash(cx, cy, seed) < EMPTY_CELL_SHARE) continue
      const kind = hash(cx, cy, seed + 101)
      const x = cx * CELL + Math.floor(hash(cx, cy, seed + 202) * CELL)
      const y = cy * CELL + Math.floor(hash(cx, cy, seed + 303) * CELL)
      const tint = TINTS[Math.floor(hash(cx, cy, seed + 404) * TINTS.length)]
      const strength = 0.55 + hash(cx, cy, seed + 505) * 0.45
      const shaded = hash(cx, cy, seed + 606) < 0.4

      if (kind < 0.6) {
        // Fleck: a two-pixel facet catching the light.
        plot(x, y, strength, tint)
        if (hash(cx, cy, seed + 707) < 0.5) plot(x + 1, y, strength * 0.8, tint)
        else plot(x, y + 1, strength * 0.8, tint)
        plot(x + 1, y + 1, strength * 0.45, tint)
        if (shaded) plot(x - 1, y + 1, 0.3, SHADE)
        continue
      }

      if (kind < 0.9) {
        // Glint: bright core with a short four-point cross.
        const arm = 2 + Math.floor(hash(cx, cy, seed + 808) * 2)
        const falloff = [1, 0.8, 0.5, 0.25]
        plot(x, y, 1, tint)
        for (let d = 1; d <= arm; d++) {
          const a = falloff[d] * (0.85 + strength * 0.15)
          plot(x + d, y, a, tint)
          plot(x - d, y, a, tint)
          plot(x, y + d, a, tint)
          plot(x, y - d, a, tint)
        }
        plot(x + 1, y + 1, 0.35, tint)
        plot(x - 1, y + 1, 0.35, tint)
        plot(x + 1, y - 1, 0.35, tint)
        plot(x - 1, y - 1, 0.35, tint)
        if (shaded) plot(x + 2, y + 2, 0.24, SHADE)
        continue
      }

      // Star: wider core and long rays, the rare flash that sells the effect.
      const rays = [0.95, 0.85, 0.65, 0.45, 0.28, 0.14]
      plot(x, y, 1, tint)
      for (let d = 1; d < rays.length; d++) {
        plot(x + d, y, rays[d], tint)
        plot(x - d, y, rays[d], tint)
        plot(x, y + d, rays[d], tint)
        plot(x, y - d, rays[d], tint)
      }
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        plot(x + dx, y + dy, 0.55, tint)
        plot(x + dx * 2, y + dy * 2, 0.2, tint)
      }
      plot(x + 3, y + 3, 0.22, SHADE)
    }
  }

  return { size, rgba }
}

let defaultGlitter: FinishTile | null = null

/** The shared glitter texture used by brushes and the bucket. */
export function glitterTile(): FinishTile {
  defaultGlitter ??= createGlitterTile()
  return defaultGlitter
}

/**
 * Builds the finish overlay for one rectangle of a brush stroke.
 *
 * `coverage` is the RGBA read back from the stroke's mask canvas (only its
 * alpha is used): where the stroke left no paint the overlay is transparent,
 * so no sparkle can float outside the paint; where the stroke fully covers a
 * pixel the overlay is exactly the tile, so a brush shows the very sparkles a
 * bucket fill gives those pixels. Partial coverage fades the sparkle.
 */
export function composeFinishOverlay(
  coverage: Uint8ClampedArray,
  rectX: number,
  rectY: number,
  width: number,
  height: number,
  tile: FinishTile,
  out: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4),
): Uint8ClampedArray {
  const size = tile.size
  for (let y = 0; y < height; y++) {
    const ty = (((rectY + y) % size) + size) % size
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4
      const paint = coverage[p + 3]
      const t = (ty * size + ((((rectX + x) % size) + size) % size)) * 4
      const a = paint === 0 ? 0 : Math.round((tile.rgba[t + 3] * paint) / 255)
      if (a === 0) {
        out[p] = 0
        out[p + 1] = 0
        out[p + 2] = 0
        out[p + 3] = 0
        continue
      }
      out[p] = tile.rgba[t]
      out[p + 1] = tile.rgba[t + 1]
      out[p + 2] = tile.rgba[t + 2]
      out[p + 3] = a
    }
  }
  return out
}

/**
 * Writes base colour + tile overlay for canvas pixel (x, y) into `out` at byte
 * offset `p`. The result is always opaque.
 */
export function writeFinishedPixel(
  out: Uint8ClampedArray,
  p: number,
  base: Rgb,
  tile: FinishTile,
  x: number,
  y: number,
): void {
  const size = tile.size
  const t = (((y % size) + size) % size) * size + (((x % size) + size) % size)
  const a = tile.rgba[t * 4 + 3]
  if (a === 0) {
    out[p] = base.r
    out[p + 1] = base.g
    out[p + 2] = base.b
  } else {
    const k = a / 255
    out[p] = Math.round(base.r + (tile.rgba[t * 4] - base.r) * k)
    out[p + 1] = Math.round(base.g + (tile.rgba[t * 4 + 1] - base.g) * k)
    out[p + 2] = Math.round(base.b + (tile.rgba[t * 4 + 2] - base.b) * k)
  }
  out[p + 3] = 255
}
