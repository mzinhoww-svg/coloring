import { describe, expect, it } from 'vitest'
import { clientToCanvas } from '../../src/engine/geometry'

const rect = { left: 100, top: 50, width: 400, height: 500 }

describe('clientToCanvas', () => {
  it('maps corners and centre through scale and offset', () => {
    expect(clientToCanvas(rect, 100, 50, 800, 800)).toMatchObject({ x: 0, y: 0, inside: true })
    expect(clientToCanvas(rect, 500, 550, 800, 800)).toMatchObject({ x: 800, y: 800, inside: true })
    expect(clientToCanvas(rect, 300, 300, 800, 800)).toMatchObject({ x: 400, y: 400, inside: true })
  })

  it('supports non-square scaling', () => {
    const point = clientToCanvas({ left: 0, top: 0, width: 100, height: 50 }, 50, 25, 1000, 1000)
    expect(point.x).toBe(500)
    expect(point.y).toBe(500)
  })

  it('clamps stray pointer coordinates but reports them as outside', () => {
    const point = clientToCanvas(rect, -40, 900, 800, 800)
    expect(point).toMatchObject({ x: 0, y: 800, inside: false })
  })

  it('does not divide by zero for a collapsed rect', () => {
    const point = clientToCanvas({ left: 0, top: 0, width: 0, height: 0 }, 10, 10, 800, 800)
    expect(Number.isFinite(point.x)).toBe(true)
    expect(Number.isFinite(point.y)).toBe(true)
    expect(point).toMatchObject({ x: 800, y: 800 })
  })
})
