/**
 * Synchronous PNG snapshots.
 *
 * Autosave must be durable in the same task as the action that produced it.
 * `canvas.toBlob()` and any other promise/timer hop gives a reload the chance
 * to tear the document down before the IndexedDB transaction has even started,
 * and the write is lost. `toDataURL()` is synchronous, so the transaction can be
 * opened immediately; the price is a few milliseconds of PNG encoding.
 */

/** Decodes a base64 `data:` URL into a Blob without any async hop. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Snapshot inválido.')
  const header = dataUrl.slice(0, comma)
  if (!/;base64$/i.test(header)) throw new Error('Snapshot não está em base64.')
  const mime = /^data:([^;,]+)[;,]/.exec(header)?.[1] ?? 'image/png'
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime })
}

/** Encodes a canvas to a PNG Blob synchronously (no `toBlob` round trip). */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Blob {
  return dataUrlToBlob(canvas.toDataURL('image/png'))
}
