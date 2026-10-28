import { describe, expect, it } from 'vitest'
import {
  GLITTER_TILE_SIZE,
  composeFinishOverlay,
  createGlitterTile,
  glitterTile,
} from '../../src/engine/finish'
import { paintGlitterRegionBox, type Region } from '../../src/engine/region'

/** Share of the previous bucket texture that was not the base colour (9 % light + 3.5 % dark). */
const PREVIOUS_GLITTER_DENSITY = 0.125

function fullRegion(width: number, height: number): Region {
  const mask = new Uint8Array(width * height).fill(1)
  return { mask, width, height, minX: 0, minY: 0, maxX: width - 1, maxY: height - 1, pixelCount: width * height }
}

function alphaAt(rgba: Uint8ClampedArray, index: number): number {
  return rgba[index * 4 + 3]
}

describe('glitter tile', () => {
  it('is deterministic for a seed and changes with another seed', () => {
    const first = createGlitterTile(GLITTER_TILE_SIZE, 3)
    const again = createGlitterTile(GLITTER_TILE_SIZE, 3)
    const other = createGlitterTile(GLITTER_TILE_SIZE, 4)
    expect(first.size).toBe(GLITTER_TILE_SIZE)
    expect(first.rgba.length).toBe(GLITTER_TILE_SIZE * GLITTER_TILE_SIZE * 4)
    expect(Array.from(again.rgba)).toEqual(Array.from(first.rgba))
    expect(Array.from(other.rgba)).not.toEqual(Array.from(first.rgba))
  })

  it('leaves at least 85% of the tile untouched so the base colour dominates', () => {
    const tile = glitterTile()
    const pixels = tile.size * tile.size
    let clear = 0
    for (let i = 0; i < pixels; i++) if (alphaAt(tile.rgba, i) === 0) clear++
    expect(clear / pixels).toBeGreaterThanOrEqual(0.85)
    expect(1 - clear / pixels).toBeLessThanOrEqual(PREVIOUS_GLITTER_DENSITY)
  })

  it('has enough strong sparkle pixels to read as glitter at phone scale', () => {
    const tile = glitterTile()
    const pixels = tile.size * tile.size
    let strong = 0
    for (let i = 0; i < pixels; i++) if (alphaAt(tile.rgba, i) >= 0.45 * 255) strong++
    expect(strong / pixels).toBeGreaterThanOrEqual(0.03)
    expect(strong / pixels).toBeLessThanOrEqual(0.1)
  })

  it('mixes small flecks with multi-pixel star glints instead of single-pixel noise', () => {
    const tile = glitterTile()
    const { size, rgba } = tile
    let cores = 0
    let starCores = 0
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (alphaAt(rgba, y * size + x) < 250) continue
        cores++
        const around = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
          [x - 2, y],
          [x + 2, y],
          [x, y - 2],
          [x, y + 2],
        ].filter(([nx, ny]) => {
          const wx = (nx + size) % size
          const wy = (ny + size) % size
          return alphaAt(rgba, wy * size + wx) >= 0.3 * 255
        }).length
        if (around >= 6) starCores++
      }
    }
    expect(cores).toBeGreaterThan(40)
    expect(starCores).toBeGreaterThan(15)
    const levels = new Set<number>()
    for (let i = 0; i < size * size; i++) {
      const a = alphaAt(rgba, i)
      if (a > 0) levels.add(a >> 4)
    }
    expect(levels.size).toBeGreaterThanOrEqual(8)
  })

  it('uses several highlight tints rather than flat white', () => {
    const { size, rgba } = glitterTile()
    const tints = new Set<string>()
    for (let i = 0; i < size * size; i++) {
      if (alphaAt(rgba, i) < 200) continue
      tints.add(`${rgba[i * 4]},${rgba[i * 4 + 1]},${rgba[i * 4 + 2]}`)
    }
    expect(tints.size).toBeGreaterThanOrEqual(3)
  })
})

describe('glitter bucket fill', () => {
  const size = 256
  const region = fullRegion(size, size)

  function fill(color: { r: number; g: number; b: number }): Uint8ClampedArray {
    const out = new Uint8ClampedArray(size * size * 4)
    paintGlitterRegionBox(out, size, region, 0, 0, color, glitterTile())
    return out
  }

  it('keeps at least 85% of the filled region exactly in the base colour', () => {
    const color = { r: 196, g: 122, b: 232 }
    const out = fill(color)
    let base = 0
    for (let i = 0; i < size * size; i++) {
      const p = i * 4
      expect(out[p + 3]).toBe(255)
      if (out[p] === color.r && out[p + 1] === color.g && out[p + 2] === color.b) base++
    }
    expect(base / (size * size)).toBeGreaterThanOrEqual(0.85)
  })

  it('makes sparkles clearly lighter than a mid-tone base colour', () => {
    const color = { r: 87, g: 199, b: 133 }
    const out = fill(color)
    let light = 0
    for (let i = 0; i < size * size; i++) {
      const p = i * 4
      const lift = (out[p] - color.r + out[p + 1] - color.g + out[p + 2] - color.b) / 3
      if (lift > 25) light++
    }
    expect(light / (size * size)).toBeGreaterThan(0.02)
    expect(light / (size * size)).toBeLessThan(0.12)
  })

  it('stays visible on white paint', () => {
    const color = { r: 255, g: 255, b: 255 }
    const out = fill(color)
    let visible = 0
    for (let i = 0; i < size * size; i++) {
      const p = i * 4
      const delta = Math.max(Math.abs(out[p] - 255), Math.abs(out[p + 1] - 255), Math.abs(out[p + 2] - 255))
      if (delta >= 24) visible++
    }
    expect(visible / (size * size)).toBeGreaterThan(0.01)
  })

  it('is anchored to canvas coordinates, so brush and bucket share the same sparkles', () => {
    const color = { r: 62, g: 119, b: 219 }
    const canvasWidth = 400
    const big = { ...fullRegion(canvasWidth, canvasWidth) }
    const whole = new Uint8ClampedArray(canvasWidth * canvasWidth * 4)
    paintGlitterRegionBox(whole, canvasWidth, big, 0, 0, color, glitterTile())

    const box = { x: 137, y: 211, width: 90, height: 70 }
    const partial = new Uint8ClampedArray(box.width * box.height * 4)
    paintGlitterRegionBox(partial, box.width, big, box.x, box.y, color, glitterTile())

    for (let y = 0; y < box.height; y++) {
      for (let x = 0; x < box.width; x++) {
        const p = (y * box.width + x) * 4
        const q = ((box.y + y) * canvasWidth + box.x + x) * 4
        expect([partial[p], partial[p + 1], partial[p + 2], partial[p + 3]]).toEqual([
          whole[q],
          whole[q + 1],
          whole[q + 2],
          whole[q + 3],
        ])
      }
    }
  })

  it('never writes outside the region mask', () => {
    const width = 64
    const mask = new Uint8Array(width * width)
    for (let y = 10; y < 40; y++) for (let x = 12; x < 50; x++) mask[y * width + x] = 1
    const region: Region = { mask, width, height: width, minX: 12, minY: 10, maxX: 49, maxY: 39, pixelCount: 38 * 30 }
    const out = new Uint8ClampedArray(width * width * 4).fill(9)
    const painted = paintGlitterRegionBox(out, width, region, 0, 0, { r: 200, g: 40, b: 60 }, glitterTile())
    expect(painted).toBe(38 * 30)
    for (let i = 0; i < width * width; i++) {
      if (mask[i]) continue
      expect(Array.from(out.slice(i * 4, i * 4 + 4))).toEqual([9, 9, 9, 9])
    }
  })
})

describe('glitter brush overlay', () => {
  /** RGBA coverage buffer as read back from the stroke mask canvas. */
  function coverage(width: number, height: number, alphaAt: (x: number, y: number) => number) {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = alphaAt(x, y)
    }
    return data
  }

  /** Canvas source-over of a straight-alpha overlay pixel onto an opaque base. */
  function over(base: { r: number; g: number; b: number }, overlay: Uint8ClampedArray, p: number) {
    const k = overlay[p + 3] / 255
    return [
      Math.round(base.r + (overlay[p] - base.r) * k),
      Math.round(base.g + (overlay[p + 1] - base.g) * k),
      Math.round(base.b + (overlay[p + 2] - base.b) * k),
    ]
  }

  it('is fully transparent wherever the stroke left no paint', () => {
    const width = 120
    const height = 90
    const disc = (x: number, y: number) => (Math.hypot(x - 60, y - 45) <= 30 ? 255 : 0)
    const overlay = composeFinishOverlay(coverage(width, height, disc), 333, 77, width, height, glitterTile())
    let sparkles = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = overlay[(y * width + x) * 4 + 3]
        if (disc(x, y) === 0) expect(a, `loose sparkle at ${x},${y}`).toBe(0)
        else if (a > 0) sparkles++
      }
    }
    expect(sparkles, 'the painted disc carries glitter').toBeGreaterThan(40)
  })

  it('gives a fully painted stroke exactly the sparkles the bucket gives the same pixels', () => {
    const rect = { x: 410, y: 268, width: 96, height: 64 }
    const color = { r: 196, g: 122, b: 232 }
    const overlay = composeFinishOverlay(
      coverage(rect.width, rect.height, () => 255),
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      glitterTile(),
    )
    const canvasWidth = 1024
    const mask = new Uint8Array(canvasWidth * canvasWidth)
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) mask[y * canvasWidth + x] = 1
    }
    const region: Region = {
      mask,
      width: canvasWidth,
      height: canvasWidth,
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width - 1,
      maxY: rect.y + rect.height - 1,
      pixelCount: rect.width * rect.height,
    }
    const bucket = new Uint8ClampedArray(rect.width * rect.height * 4)
    paintGlitterRegionBox(bucket, rect.width, region, rect.x, rect.y, color, glitterTile())
    for (let i = 0; i < rect.width * rect.height; i++) {
      expect(over(color, overlay, i * 4)).toEqual([bucket[i * 4], bucket[i * 4 + 1], bucket[i * 4 + 2]])
    }
  })

  it('fades sparkles with partial coverage at the soft edge of a stroke', () => {
    const tile = glitterTile()
    const full = composeFinishOverlay(coverage(64, 64, () => 255), 0, 0, 64, 64, tile)
    const half = composeFinishOverlay(coverage(64, 64, () => 128), 0, 0, 64, 64, tile)
    let compared = 0
    for (let i = 0; i < 64 * 64; i++) {
      const a = full[i * 4 + 3]
      if (a === 0) {
        expect(half[i * 4 + 3]).toBe(0)
        continue
      }
      compared++
      expect(half[i * 4 + 3]).toBe(Math.round((a * 128) / 255))
      expect(Array.from(half.slice(i * 4, i * 4 + 3))).toEqual(Array.from(full.slice(i * 4, i * 4 + 3)))
    }
    expect(compared).toBeGreaterThan(50)
  })
})
