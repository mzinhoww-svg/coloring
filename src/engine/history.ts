/**
 * Bounded, patch-based undo history.
 *
 * Every user action is one atomic entry storing only the changed rectangle
 * twice (before/after). Whole-canvas snapshots are avoided for strokes, which
 * keeps a long drawing session within a small, predictable memory budget.
 */

export interface Patch {
  x: number
  y: number
  width: number
  height: number
  /** RGBA rows of the rectangle before the action. */
  before: Uint8ClampedArray
  /** RGBA rows of the rectangle after the action. */
  after: Uint8ClampedArray
}

export interface PatchHistoryOptions {
  /** Maximum bytes retained. Oldest entries are evicted first. */
  maxBytes?: number
  /** Hard cap on entries, in addition to the byte budget. */
  maxEntries?: number
}

const DEFAULT_MAX_BYTES = 40 * 1024 * 1024
const DEFAULT_MAX_ENTRIES = 60

export class PatchHistory {
  private entries: Patch[] = []
  private cursor = 0
  private readonly maxBytes: number
  private readonly maxEntries: number

  constructor(options: PatchHistoryOptions = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  }

  get length(): number {
    return this.entries.length
  }

  get position(): number {
    return this.cursor
  }

  get canUndo(): boolean {
    return this.cursor > 0
  }

  get canRedo(): boolean {
    return this.cursor < this.entries.length
  }

  get bytes(): number {
    return this.entries.reduce((sum, patch) => sum + patchByteSize(patch), 0)
  }

  /** Adds one atomic action, discarding any redo branch. */
  push(patch: Patch): void {
    if (patch.width <= 0 || patch.height <= 0) return
    if (patch.before.length !== patch.width * patch.height * 4) {
      throw new Error('before patch does not match its rectangle')
    }
    if (patch.after.length !== patch.width * patch.height * 4) {
      throw new Error('after patch does not match its rectangle')
    }
    if (this.cursor < this.entries.length) this.entries.length = this.cursor
    this.entries.push(patch)
    this.cursor = this.entries.length
    this.evict()
  }

  /** Returns the patch to apply for an undo, or null when nothing remains. */
  undo(): Patch | null {
    if (!this.canUndo) return null
    this.cursor--
    return this.entries[this.cursor]
  }

  /** Returns the patch to apply for a redo, or null at the newest action. */
  redo(): Patch | null {
    if (!this.canRedo) return null
    const patch = this.entries[this.cursor]
    this.cursor++
    return patch
  }

  clear(): void {
    this.entries = []
    this.cursor = 0
  }

  private evict(): void {
    while (this.entries.length > this.maxEntries) {
      this.entries.shift()
      this.cursor--
    }
    while (this.bytes > this.maxBytes && this.entries.length > 1) {
      this.entries.shift()
      this.cursor--
    }
    if (this.cursor < 0) this.cursor = 0
  }
}

export function patchByteSize(patch: Patch): number {
  return patch.before.byteLength + patch.after.byteLength
}
