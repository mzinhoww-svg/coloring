import { describe, expect, it } from 'vitest'
import { drawings, getDrawingSvg, packs } from '../../src/content/art'

const PACK_IDS = [
  'animals',
  'dinosaurs',
  'transport',
  'underwater',
  'fairytale',
  'robots',
  'princess',
  'alien',
  'christmas',
]

describe('content contract', () => {
  it('exposes the nine required packs in a stable order', () => {
    expect(packs.map((pack) => pack.id)).toEqual(PACK_IDS)
    for (const pack of packs) {
      expect(pack.title.trim().length).toBeGreaterThan(0)
      expect(pack.emoji.trim().length).toBeGreaterThan(0)
      expect(pack.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('has 15 uniquely identified drawings in every pack', () => {
    expect(drawings).toHaveLength(135)
    for (const packId of PACK_IDS) {
      const packDrawings = drawings.filter((drawing) => drawing.packId === packId)
      expect(packDrawings).toHaveLength(15)
    }
    const ids = new Set(drawings.map((drawing) => drawing.id))
    expect(ids.size).toBe(135)
  })

  it('returns self-contained 800x800 SVG for every drawing', () => {
    for (const drawing of drawings) {
      const svg = getDrawingSvg(drawing.id)
      expect(svg).toContain('<svg')
      expect(svg).toMatch(/viewBox=["']0 0 800 800["']/)
      expect(svg).not.toMatch(/<script/i)
      expect(svg).not.toMatch(/<image/i)
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/i)
    }
  })

  it('rejects unknown drawing ids instead of returning placeholder art', () => {
    expect(() => getDrawingSvg('not-a-drawing')).toThrow()
  })
})
