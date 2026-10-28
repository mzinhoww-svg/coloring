import { describe, expect, it } from 'vitest'
import {
  buildBoundaryMask,
  dilateMask,
  findNearestOpen,
  floodFillRegion,
  hexToRgb,
  paintRegion,
  paintRegionBox,
  paintGlitterRegionBox,
  regionBox,
} from '../../src/engine/region'

function rgba(width: number, height: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4)
  return data
}

function boxMask(width: number, height: number, left: number, top: number, right: number, bottom: number) {
  const mask = new Uint8Array(width * height)
  for (let x = left; x <= right; x++) {
    mask[top * width + x] = 1
    mask[bottom * width + x] = 1
  }
  for (let y = top; y <= bottom; y++) {
    mask[y * width + left] = 1
    mask[y * width + right] = 1
  }
  return mask
}

describe('buildBoundaryMask', () => {
  it('marks only sufficiently opaque dark pixels', () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 255, // paper
      20, 20, 24, 255, // line
      0, 0, 0, 0, // transparent
      0, 0, 0, 20, // nearly invisible anti-aliasing
    ])
    const mask = buildBoundaryMask(data, 4, 1)
    expect(Array.from(mask)).toEqual([0, 1, 0, 0])
  })

  it('respects custom luminance and alpha thresholds', () => {
    const data = new Uint8ClampedArray([
      120, 120, 120, 255,
      120, 120, 120, 255,
    ])
    expect(Array.from(buildBoundaryMask(data, 2, 1))).toEqual([1, 1])
    expect(
      Array.from(buildBoundaryMask(data, 2, 1, { luminanceThreshold: 100 })),
    ).toEqual([0, 0])
    expect(
      Array.from(buildBoundaryMask(data, 2, 1, { minAlpha: 255, luminanceThreshold: 200 })),
    ).toEqual([1, 1])
  })

  it('rejects undersized buffers', () => {
    expect(() => buildBoundaryMask(new Uint8ClampedArray(4), 2, 2)).toThrow()
  })
})

describe('dilateMask', () => {
  it('grows a single boundary pixel by one ring', () => {
    const mask = new Uint8Array(25)
    mask[2 * 5 + 2] = 1
    const out = dilateMask(mask, 5, 5, 1)
    expect(out[2 * 5 + 2]).toBe(1)
    expect(out[1 * 5 + 2]).toBe(1)
    expect(out[3 * 5 + 2]).toBe(1)
    expect(out[2 * 5 + 1]).toBe(1)
    expect(out[2 * 5 + 3]).toBe(1)
    expect(out[1 * 5 + 1]).toBe(0)
    expect(out.reduce((a, b) => a + b, 0)).toBe(5)
  })

  it('does not mutate the input', () => {
    const mask = new Uint8Array([1, 0, 0, 0])
    dilateMask(mask, 2, 2, 1)
    expect(Array.from(mask)).toEqual([1, 0, 0, 0])
  })
})

describe('floodFillRegion', () => {
  it('fills only the interior of a closed box', () => {
    const mask = boxMask(9, 9, 2, 2, 6, 6)
    const region = floodFillRegion(mask, 9, 9, 4, 4)
    expect(region).not.toBeNull()
    expect(region!.pixelCount).toBe(9)
    expect([region!.minX, region!.minY, region!.maxX, region!.maxY]).toEqual([3, 3, 5, 5])
    expect(region!.mask[4 * 9 + 4]).toBe(1)
    expect(region!.mask[2 * 9 + 4]).toBe(0)
    expect(region!.mask[7 * 9 + 7]).toBe(0)
  })

  it('does not leak through a diagonal line because fill is 4-connected', () => {
    const width = 5
    const height = 5
    const mask = new Uint8Array(width * height)
    mask[0 * width + 0] = 1
    mask[1 * width + 1] = 1
    mask[2 * width + 2] = 1
    mask[3 * width + 3] = 1
    mask[4 * width + 4] = 1

    const topRight = floodFillRegion(mask, width, height, 4, 0)
    expect(topRight).not.toBeNull()
    expect(topRight!.mask[0 * width + 4]).toBe(1)
    expect(topRight!.mask[4 * width + 0]).toBe(0)

    const bottomLeft = floodFillRegion(mask, width, height, 0, 4)
    expect(bottomLeft).not.toBeNull()
    expect(bottomLeft!.mask[4 * width + 0]).toBe(1)
    expect(bottomLeft!.mask[0 * width + 4]).toBe(0)
  })

  it('recovers the nearest open pixel when the tap lands on linework', () => {
    const mask = boxMask(9, 9, 2, 2, 6, 6)
    const region = floodFillRegion(mask, 9, 9, 2, 4)
    expect(region).not.toBeNull()
    expect(region!.pixelCount > 0).toBe(true)
  })

  it('fills to the canvas edge when the region touches it', () => {
    const mask = new Uint8Array(9)
    const region = floodFillRegion(mask, 3, 3, 0, 0)
    expect(region!.pixelCount).toBe(9)
    expect([region!.minX, region!.minY, region!.maxX, region!.maxY]).toEqual([0, 0, 2, 2])
  })

  it('returns null for out-of-bounds taps or fully enclosed taps', () => {
    const mask = new Uint8Array(9)
    expect(floodFillRegion(mask, 3, 3, -1, 0)).toBeNull()
    expect(floodFillRegion(mask, 3, 3, 3, 0)).toBeNull()
    expect(floodFillRegion(new Uint8Array([1]), 1, 1, 0, 0)).toBeNull()
  })

  it('handles a large region in bounded time', () => {
    const size = 256
    const mask = new Uint8Array(size * size)
    const started = performance.now()
    const region = floodFillRegion(mask, size, size, 10, 10)
    const elapsed = performance.now() - started
    expect(region!.pixelCount).toBe(size * size)
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('findNearestOpen', () => {
  it('returns the tapped open pixel untouched', () => {
    const mask = new Uint8Array(9)
    expect(findNearestOpen(mask, 3, 3, 1, 1)).toBe(4)
  })

  it('scans outward from a boundary pixel', () => {
    const mask = new Uint8Array(25)
    mask.fill(1)
    mask[2 * 5 + 3] = 0
    expect(findNearestOpen(mask, 5, 5, 2, 2, 2)).toBe(2 * 5 + 3)
  })
})

describe('paintRegion', () => {
  it('paints only selected pixels and leaves linework/background untouched', () => {
    const width = 4
    const data = rgba(width, 4, [10, 20, 30, 40])
    const region = floodFillRegion(boxMask(4, 4, 0, 0, 3, 3), 4, 4, 1, 1)
    expect(region).not.toBeNull()
    const painted = paintRegion(data, width, region!, { r: 255, g: 0, b: 128 })
    expect(painted).toBe(4)
    expect(Array.from(data.slice((1 * width + 1) * 4, (1 * width + 1) * 4 + 4))).toEqual([
      255, 0, 128, 255,
    ])
    expect(Array.from(data.slice(0, 4))).toEqual([10, 20, 30, 40])
    expect(Array.from(data.slice((2 * width + 2) * 4, (2 * width + 2) * 4 + 4))).toEqual([
      255, 0, 128, 255,
    ])
  })
})

describe('paintRegionBox', () => {
  it('writes bounding-box-relative pixels without touching the rest', () => {
    const region = floodFillRegion(boxMask(9, 9, 2, 2, 6, 6), 9, 9, 4, 4)!
    const box = regionBox(region)
    expect(box).toEqual({ x: 3, y: 3, width: 3, height: 3 })
    const boxData = new Uint8ClampedArray(box.width * box.height * 4).fill(7)
    const painted = paintRegionBox(boxData, box.width, region, box.x, box.y, {
      r: 1,
      g: 2,
      b: 3,
    })
    expect(painted).toBe(9)
    expect(Array.from(boxData.slice(0, 4))).toEqual([1, 2, 3, 255])
    expect(Array.from(boxData.slice(-4))).toEqual([1, 2, 3, 255])
    expect(boxData.length).toBe(3 * 3 * 4)
  })
})

describe('paintGlitterRegionBox', () => {
  it('fills the selected region with a repeatable glitter texture', () => {
    const size = 64
    const mask = new Uint8Array(size * size)
    mask.fill(1)
    const region = {
      mask,
      width: size,
      height: size,
      minX: 0,
      minY: 0,
      maxX: size - 1,
      maxY: size - 1,
      pixelCount: size * size,
    }
    const first = new Uint8ClampedArray(size * size * 4)
    const second = new Uint8ClampedArray(size * size * 4)
    const rgb = { r: 230, g: 90, b: 120 }

    expect(paintGlitterRegionBox(first, size, region, 0, 0, rgb, 7)).toBe(size * size)
    paintGlitterRegionBox(second, size, region, 0, 0, rgb, 7)
    expect(Array.from(first)).toEqual(Array.from(second))
    expect(new Set(Array.from({ length: size * size }, (_, i) => Array.from(first.slice(i * 4, i * 4 + 3)).join(','))).size).toBeGreaterThan(1)
  })
})

describe('hexToRgb', () => {
  it('parses short and long hex values', () => {
    expect(hexToRgb('#f80')).toEqual({ r: 255, g: 136, b: 0 })
    expect(hexToRgb('2A6FDB')).toEqual({ r: 42, g: 111, b: 219 })
  })

  it('rejects malformed values', () => {
    expect(hexToRgb('#12')).toBeNull()
    expect(hexToRgb('tomato')).toBeNull()
  })
})
