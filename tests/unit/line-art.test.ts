import { describe, expect, it } from 'vitest'
import { stripPaperWhite } from '../../src/engine/line-art'

function pixel(r: number, g: number, b: number, a: number): number[] {
  return [r, g, b, a]
}

describe('stripPaperWhite', () => {
  it('makes opaque white transparent', () => {
    const data = new Uint8ClampedArray(pixel(255, 255, 255, 255))
    expect(stripPaperWhite(data)).toBe(1)
    expect(Array.from(data)).toEqual([0, 0, 0, 0])
  })

  it('keeps dark linework and its anti-aliasing', () => {
    const data = new Uint8ClampedArray([
      ...pixel(24, 22, 30, 255),
      ...pixel(150, 148, 152, 255),
      ...pixel(238, 238, 238, 255),
      ...pixel(242, 242, 242, 255),
    ])
    expect(stripPaperWhite(data, 240)).toBe(1)
    expect(Array.from(data.slice(0, 4))).toEqual([24, 22, 30, 255])
    expect(Array.from(data.slice(4, 8))).toEqual([150, 148, 152, 255])
    expect(Array.from(data.slice(8, 12))).toEqual([238, 238, 238, 255])
    expect(Array.from(data.slice(12, 16))).toEqual([0, 0, 0, 0])
  })

  it('leaves already-transparent pixels alone', () => {
    const data = new Uint8ClampedArray(pixel(255, 255, 255, 0))
    expect(stripPaperWhite(data)).toBe(0)
    expect(Array.from(data)).toEqual([255, 255, 255, 0])
  })
})
