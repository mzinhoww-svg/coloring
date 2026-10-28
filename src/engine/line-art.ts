/**
 * The content contract keeps drawing regions white and linework dark. A
 * rasterised SVG therefore arrives with opaque white "paper" that must not be
 * painted over the colour layer. This removes near-white pixels while keeping
 * dark and mid-tone linework (including its anti-aliasing).
 */
export function stripPaperWhite(
  rgba: Uint8ClampedArray,
  cutoff = 240,
): number {
  let removed = 0
  for (let p = 0; p < rgba.length; p += 4) {
    if (rgba[p + 3] === 0) continue
    const luminance = 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]
    if (luminance >= cutoff) {
      rgba[p] = 0
      rgba[p + 1] = 0
      rgba[p + 2] = 0
      rgba[p + 3] = 0
      removed++
    }
  }
  return removed
}
