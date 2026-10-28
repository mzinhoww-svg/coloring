import { describe, expect, it } from 'vitest'
import { TOOLS } from '../../src/engine/brushes'

describe('painting tools and finishes', () => {
  it('keeps glitter as a palette finish instead of a painting tool', () => {
    expect(TOOLS.map(({ id }) => id)).not.toContain('glitter')
    expect(TOOLS.map(({ id }) => id)).toContain('fill')
  })
})
