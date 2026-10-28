/**
 * Region geometry for the fill bucket.
 *
 * The line art is rasterised once per drawing and converted to a boundary
 * mask. Fills are flood-filled on that mask only, so previously painted
 * colour never changes the shape of a region: the original linework is the
 * single source of truth for boundaries.
 *
 * Everything here is DOM-free so it can be unit tested in Node.
 */

export interface Region {
  /** 1 = pixel belongs to the selected connected region. */
  mask: Uint8Array
  width: number
  height: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  pixelCount: number
}

export interface BoundaryOptions {
  /** Pixels at or above this alpha participate in the line-art mask. */
  minAlpha?: number
  /** Pixels darker than this luminance become boundaries. */
  luminanceThreshold?: number
}

const DEFAULT_MIN_ALPHA = 24
const DEFAULT_LUMINANCE_THRESHOLD = 178

/**
 * Converts RGBA pixels into a 0/1 boundary mask. Only dark, sufficiently
 * opaque pixels are boundaries; the paper and coloured areas are open.
 */
export function buildBoundaryMask(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: BoundaryOptions = {},
): Uint8Array {
  if (rgba.length < width * height * 4) {
    throw new Error('RGBA buffer is smaller than the requested dimensions')
  }
  const minAlpha = options.minAlpha ?? DEFAULT_MIN_ALPHA
  const threshold = options.luminanceThreshold ?? DEFAULT_LUMINANCE_THRESHOLD
  const mask = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (rgba[p + 3] < minAlpha) continue
    const luminance = 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]
    if (luminance < threshold) mask[i] = 1
  }
  return mask
}

/**
 * Grows the boundary by `radius` pixels (4-connected). One pixel is enough to
 * cover the anti-aliased halo around the SVG linework, preventing leaks.
 */
export function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius = 1,
): Uint8Array {
  if (radius <= 0) return mask.slice()
  let current = mask
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8Array(current.length)
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        const i = row + x
        if (current[i]) {
          next[i] = 1
          continue
        }
        if (
          (x > 0 && current[i - 1]) ||
          (x < width - 1 && current[i + 1]) ||
          (y > 0 && current[i - width]) ||
          (y < height - 1 && current[i + width])
        ) {
          next[i] = 1
        }
      }
    }
    current = next
  }
  return current
}

/** Finds the closest open pixel around a tap, e.g. when tapping a line. */
export function findNearestOpen(
  boundary: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  maxRadius = 14,
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return -1
  const start = Math.floor(y) * width + Math.floor(x)
  if (!boundary[start]) return start
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const nx = Math.floor(x) + dx
        const ny = Math.floor(y) + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const i = ny * width + nx
        if (!boundary[i]) return i
      }
    }
  }
  return -1
}

/**
 * 4-connected flood fill bounded by the line-art mask. Returns null when the
 * tap is outside the drawing or entirely surrounded by linework.
 */
export function floodFillRegion(
  boundary: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  maxRadius = 14,
): Region | null {
  if (boundary.length !== width * height) throw new Error('Boundary mask has wrong dimensions')
  const start = findNearestOpen(boundary, width, height, x, y, maxRadius)
  if (start < 0) return null

  const mask = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  mask[start] = 1
  queue[tail++] = start

  while (head < tail) {
    const i = queue[head++]
    const px = i % width
    const py = (i - px) / width
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py

    if (px > 0 && boundary[i - 1] === 0 && mask[i - 1] === 0) {
      mask[i - 1] = 1
      queue[tail++] = i - 1
    }
    if (px < width - 1 && boundary[i + 1] === 0 && mask[i + 1] === 0) {
      mask[i + 1] = 1
      queue[tail++] = i + 1
    }
    if (py > 0 && boundary[i - width] === 0 && mask[i - width] === 0) {
      mask[i - width] = 1
      queue[tail++] = i - width
    }
    if (py < height - 1 && boundary[i + width] === 0 && mask[i + width] === 0) {
      mask[i + width] = 1
      queue[tail++] = i + width
    }
  }

  return {
    mask,
    width,
    height,
    minX,
    minY,
    maxX,
    maxY,
    pixelCount: tail,
  }
}

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface RegionBox {
  x: number
  y: number
  width: number
  height: number
}

export function regionBox(region: Region): RegionBox {
  return {
    x: region.minX,
    y: region.minY,
    width: region.maxX - region.minX + 1,
    height: region.maxY - region.minY + 1,
  }
}

/**
 * Paints a region into a buffer that contains only the region's bounding box.
 * `rgba` is boxWidth × boxHeight, indexed relative to the box origin.
 */
export function paintRegionBox(
  rgba: Uint8ClampedArray,
  boxWidth: number,
  region: Region,
  boxX: number,
  boxY: number,
  color: Rgb,
): number {
  const boxHeight = rgba.length / 4 / boxWidth
  let painted = 0
  for (let y = region.minY; y <= region.maxY; y++) {
    const boxRow = y - boxY
    if (boxRow < 0 || boxRow >= boxHeight) continue
    const row = y * region.width
    for (let x = region.minX; x <= region.maxX; x++) {
      const i = row + x
      if (region.mask[i] === 0) continue
      const p = (boxRow * boxWidth + (x - boxX)) * 4
      rgba[p] = color.r
      rgba[p + 1] = color.g
      rgba[p + 2] = color.b
      rgba[p + 3] = 255
      painted++
    }
  }
  return painted
}

/**
 * Fills only pixels in the selected flood-fill region with a deterministic
 * glitter grain. Keeping the mask check here guarantees the texture cannot
 * cross line art or leak into a neighbouring region.
 */
export function paintGlitterRegionBox(
  rgba: Uint8ClampedArray,
  boxWidth: number,
  region: Region,
  boxX: number,
  boxY: number,
  color: Rgb,
  seed = 0,
): number {
  const boxHeight = rgba.length / 4 / boxWidth
  let painted = 0
  for (let y = region.minY; y <= region.maxY; y++) {
    const boxRow = y - boxY
    if (boxRow < 0 || boxRow >= boxHeight) continue
    const row = y * region.width
    for (let x = region.minX; x <= region.maxX; x++) {
      const regionIndex = row + x
      if (region.mask[regionIndex] === 0) continue
      const p = (boxRow * boxWidth + (x - boxX)) * 4
      const noiseValue = Math.sin((x + seed) * 127.1 + (y - seed) * 311.7) * 43758.5453
      const noise = noiseValue - Math.floor(noiseValue)
      const variation = noise > 0.91 ? 0.82 : noise < 0.035 ? -0.28 : 0
      const vary = (channel: number) =>
        Math.round(variation > 0 ? channel + (255 - channel) * variation : channel * (1 + variation))
      rgba[p] = vary(color.r)
      rgba[p + 1] = vary(color.g)
      rgba[p + 2] = vary(color.b)
      rgba[p + 3] = 255
      painted++
    }
  }
  return painted
}

/** Parses #rgb or #rrggbb. Returns null for anything else. */
export function hexToRgb(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    }
  }
  if (/^[0-9a-f]{6}$/i.test(value)) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    }
  }
  return null
}

/**
 * Paints a region into an RGBA buffer. Only pixels selected by the region are
 * touched; line-art pixels are untouched by construction. The caller decides
 * whether to write the whole buffer back or only the region bounding box.
 */
export function paintRegion(
  rgba: Uint8ClampedArray,
  width: number,
  region: Region,
  color: Rgb,
): number {
  let painted = 0
  for (let y = region.minY; y <= region.maxY; y++) {
    const row = y * width
    for (let x = region.minX; x <= region.maxX; x++) {
      const i = row + x
      if (region.mask[i] === 0) continue
      const p = i * 4
      rgba[p] = color.r
      rgba[p + 1] = color.g
      rgba[p + 2] = color.b
      rgba[p + 3] = 255
      painted++
    }
  }
  return painted
}
