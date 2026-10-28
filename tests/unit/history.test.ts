import { describe, expect, it } from 'vitest'
import { PatchHistory, type Patch } from '../../src/engine/history'

function patch(width: number, height: number, tag = 1): Patch {
  return {
    x: 0,
    y: 0,
    width,
    height,
    before: new Uint8ClampedArray(width * height * 4).fill(tag),
    after: new Uint8ClampedArray(width * height * 4).fill(tag + 1),
  }
}

describe('PatchHistory', () => {
  it('undoes and redoes in order', () => {
    const history = new PatchHistory()
    const a = patch(1, 1, 1)
    const b = patch(1, 1, 5)
    history.push(a)
    history.push(b)

    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)
    expect(history.undo()).toBe(b)
    expect(history.undo()).toBe(a)
    expect(history.undo()).toBeNull()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
    expect(history.redo()).toBe(a)
    expect(history.redo()).toBe(b)
    expect(history.redo()).toBeNull()
  })

  it('drops the redo branch when a new action starts', () => {
    const history = new PatchHistory()
    history.push(patch(1, 1, 1))
    history.push(patch(1, 1, 3))
    history.undo()
    history.push(patch(1, 1, 7))
    expect(history.length).toBe(2)
    expect(history.canRedo).toBe(false)
    expect(history.undo()!.before[0]).toBe(7)
    expect(history.undo()!.before[0]).toBe(1)
  })

  it('ignores empty patches', () => {
    const history = new PatchHistory()
    history.push(patch(0, 0))
    expect(history.length).toBe(0)
    expect(history.canUndo).toBe(false)
  })

  it('rejects mismatched buffers', () => {
    const history = new PatchHistory()
    expect(() =>
      history.push({ ...patch(2, 2), before: new Uint8ClampedArray(4) }),
    ).toThrow()
  })

  it('evicts oldest entries under the byte budget', () => {
    // Each 4x4 patch is 128 bytes.
    const history = new PatchHistory({ maxBytes: 300, maxEntries: 10 })
    history.push(patch(4, 4, 1))
    history.push(patch(4, 4, 5))
    history.push(patch(4, 4, 9))
    expect(history.length).toBe(2)
    expect(history.undo()!.before[0]).toBe(9)
    expect(history.undo()!.before[0]).toBe(5)
    expect(history.undo()).toBeNull()
  })

  it('evicts oldest entries under the entry cap', () => {
    const history = new PatchHistory({ maxBytes: 10_000_000, maxEntries: 2 })
    history.push(patch(1, 1, 1))
    history.push(patch(1, 1, 3))
    history.push(patch(1, 1, 5))
    expect(history.length).toBe(2)
    expect(history.canUndo).toBe(true)
  })

  it('keeps the cursor consistent while evicting from a redo position', () => {
    const history = new PatchHistory({ maxBytes: 10_000_000, maxEntries: 2 })
    history.push(patch(1, 1, 1))
    history.push(patch(1, 1, 3))
    history.push(patch(1, 1, 5))
    expect(history.undo()!.before[0]).toBe(5)
    history.push(patch(1, 1, 7))
    expect(history.length).toBe(2)
    expect(history.canRedo).toBe(false)
    expect(history.undo()!.before[0]).toBe(7)
    expect(history.undo()!.before[0]).toBe(3)
  })

  it('reports retained bytes', () => {
    const history = new PatchHistory()
    history.push(patch(2, 3))
    expect(history.bytes).toBe(2 * 3 * 4 * 2)
  })
})
