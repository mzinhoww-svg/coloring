import { describe, expect, it } from 'vitest'
import { canvasToPngBlob, dataUrlToBlob } from '../../src/storage/snapshot'

/** 1×1 transparent PNG, the smallest realistic payload the encoder can emit. */
const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

describe('dataUrlToBlob', () => {
  it('decodes a PNG data URL into a Blob with the same bytes', async () => {
    const blob = dataUrlToBlob(ONE_PIXEL_PNG)
    expect(blob.type).toBe('image/png')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // PNG magic number proves the base64 payload survived the decode.
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(blob.size).toBe(70)
  })

  it('keeps the declared MIME type for other encodings', () => {
    const blob = dataUrlToBlob('data:image/webp;base64,aGVsbG8=')
    expect(blob.type).toBe('image/webp')
    expect(blob.size).toBe(5)
  })

  it('rejects payloads that are not base64 data URLs', () => {
    expect(() => dataUrlToBlob('not-a-data-url')).toThrow(/inválido/i)
    expect(() => dataUrlToBlob('data:image/png,raw-bytes')).toThrow(/base64/i)
  })
})

describe('canvasToPngBlob', () => {
  it('returns a Blob synchronously, with no promise or timer hop', () => {
    const calls: string[] = []
    const fakeCanvas = {
      toDataURL: (type: string) => {
        calls.push(type)
        return ONE_PIXEL_PNG
      },
    } as unknown as HTMLCanvasElement

    const result = canvasToPngBlob(fakeCanvas)

    // The write must be startable in the same task as the stroke: by the time
    // this call returns, the snapshot already exists.
    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('image/png')
    expect(calls).toEqual(['image/png'])
  })
})
