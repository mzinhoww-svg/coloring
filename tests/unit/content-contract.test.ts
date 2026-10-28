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

/**
 * Expected gallery distribution: six packs with 16 drawings and three with 15.
 * The total is derived from this map instead of being hard-coded separately.
 */
const EXPECTED_PER_PACK: Record<string, number> = {
  animals: 16,
  dinosaurs: 15,
  transport: 16,
  underwater: 16,
  fairytale: 16,
  robots: 16,
  princess: 15,
  alien: 15,
  christmas: 16,
}
const EXPECTED_TOTAL = Object.values(EXPECTED_PER_PACK).reduce((sum, count) => sum + count, 0)

describe('content contract', () => {
  it('exposes the nine required packs in a stable order', () => {
    expect(packs.map((pack) => pack.id)).toEqual(PACK_IDS)
    for (const pack of packs) {
      expect(pack.title.trim().length).toBeGreaterThan(0)
      expect(pack.emoji.trim().length).toBeGreaterThan(0)
      expect(pack.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('has the expected number of uniquely identified drawings in every pack', () => {
    expect(EXPECTED_TOTAL).toBe(141)
    expect(drawings).toHaveLength(EXPECTED_TOTAL)

    for (const packId of PACK_IDS) {
      const packDrawings = drawings.filter((drawing) => drawing.packId === packId)
      expect(packDrawings, `drawing count for ${packId}`).toHaveLength(EXPECTED_PER_PACK[packId])
      // Ids are positional per pack: `<pack>-1` .. `<pack>-n`.
      expect(packDrawings.map((drawing) => drawing.id)).toEqual(
        Array.from({ length: EXPECTED_PER_PACK[packId] }, (_, index) => `${packId}-${index + 1}`),
      )
      for (const drawing of packDrawings) {
        expect(drawing.title.trim().length, `title for ${drawing.id}`).toBeGreaterThan(0)
      }
    }

    const ids = new Set(drawings.map((drawing) => drawing.id))
    expect(ids.size).toBe(EXPECTED_TOTAL)
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
