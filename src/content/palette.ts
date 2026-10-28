/**
 * Base colour palette recovered from the legacy colouring app.
 *
 * Source of truth: `evidence/reverse/palette-and-brushes.json`
 * (`evidence_id: APK-REV-PALETTE-001`, `palette_colors`, 40 entries).
 * Every `hex` below is transcribed 1:1 from `palette_colors[].rgb_hex` and the
 * array order matches `palette_colors[].index`. Alpha is always 1.0 in the
 * evidence, so the palette is stored as opaque hex.
 *
 * `id` and `name` are accessibility labels in pt-BR for UI consumption; they
 * describe the recovered ramps and do not alter the recovered colours. No
 * sprite, texture or other proprietary asset is reproduced in this module.
 */

export interface PaletteColor {
  /** Stable slug used by UI controls and `aria-*` attributes. */
  id: string
  /** Human-readable pt-BR label. */
  name: string
  /** Opaque colour exactly as recovered from the APK evidence. */
  hex: string
  /** Position in the recovered `palette_colors` array (0-based). */
  index: number
}

export const PALETTE_EVIDENCE = {
  evidenceId: 'APK-REV-PALETTE-001',
  sourceMember: 'assets/bin/Data/data.unity3d::level4',
  colorCount: 40,
} as const

export const basePalette: readonly PaletteColor[] = [
  { index: 0, id: 'vermelho-escuro', name: 'Vermelho escuro', hex: '#A62E27' },
  { index: 1, id: 'vermelho', name: 'Vermelho', hex: '#E84E46' },
  { index: 2, id: 'vermelho-suave', name: 'Vermelho suave', hex: '#E07673' },
  { index: 3, id: 'vermelho-claro', name: 'Vermelho claro', hex: '#F1B1B0' },
  { index: 4, id: 'laranja', name: 'Laranja', hex: '#EB8745' },
  { index: 5, id: 'laranja-claro', name: 'Laranja claro', hex: '#EFAA77' },
  { index: 6, id: 'pessego', name: 'Pêssego', hex: '#F2C6A5' },
  { index: 7, id: 'amarelo', name: 'Amarelo', hex: '#F9DA49' },
  { index: 8, id: 'amarelo-brilhante', name: 'Amarelo brilhante', hex: '#FDFB60' },
  { index: 9, id: 'amarelo-claro', name: 'Amarelo claro', hex: '#F9EEA2' },
  { index: 10, id: 'oliva', name: 'Oliva', hex: '#878E2B' },
  { index: 11, id: 'verde-oliva', name: 'Verde-oliva', hex: '#ADB63A' },
  { index: 12, id: 'verde-limao', name: 'Verde-limão', hex: '#CBF04D' },
  { index: 13, id: 'verde-escuro', name: 'Verde escuro', hex: '#3F8B26' },
  { index: 14, id: 'verde', name: 'Verde', hex: '#5CC63A' },
  { index: 15, id: 'verde-brilhante', name: 'Verde brilhante', hex: '#80F95C' },
  { index: 16, id: 'verde-agua-escuro', name: 'Verde-água escuro', hex: '#409074' },
  { index: 17, id: 'verde-menta', name: 'Verde-menta', hex: '#5DCBA3' },
  { index: 18, id: 'menta-claro', name: 'Menta claro', hex: '#77F6CC' },
  { index: 19, id: 'azul-petroleo', name: 'Azul-petróleo', hex: '#4499AA' },
  { index: 20, id: 'azul-celeste', name: 'Azul-celeste', hex: '#5DCAE2' },
  { index: 21, id: 'azul-celeste-claro', name: 'Azul-celeste claro', hex: '#9ED3DC' },
  { index: 22, id: 'azul-escuro', name: 'Azul escuro', hex: '#27529F' },
  { index: 23, id: 'azul', name: 'Azul', hex: '#3E77DB' },
  { index: 24, id: 'azul-claro', name: 'Azul claro', hex: '#9FC2F6' },
  { index: 25, id: 'roxo-escuro', name: 'Roxo escuro', hex: '#6A31A7' },
  { index: 26, id: 'roxo', name: 'Roxo', hex: '#A056F1' },
  { index: 27, id: 'roxo-claro', name: 'Roxo claro', hex: '#D3B3F6' },
  { index: 28, id: 'purpura', name: 'Púrpura', hex: '#9932A8' },
  { index: 29, id: 'purpura-brilhante', name: 'Púrpura brilhante', hex: '#DB4FF0' },
  { index: 30, id: 'purpura-clara', name: 'Púrpura clara', hex: '#E8A4F4' },
  { index: 31, id: 'rosa-escuro', name: 'Rosa escuro', hex: '#AB3D71' },
  { index: 32, id: 'rosa', name: 'Rosa', hex: '#E7579A' },
  { index: 33, id: 'rosa-claro', name: 'Rosa claro', hex: '#EEA1C7' },
  { index: 34, id: 'marrom', name: 'Marrom', hex: '#5C4535' },
  { index: 35, id: 'marrom-claro', name: 'Marrom claro', hex: '#837062' },
  { index: 36, id: 'cinza', name: 'Cinza', hex: '#686D71' },
  { index: 37, id: 'cinza-claro', name: 'Cinza claro', hex: '#A5ABB2' },
  { index: 38, id: 'grafite', name: 'Grafite', hex: '#313335' },
  { index: 39, id: 'branco', name: 'Branco', hex: '#FFFFFF' },
] as const

/** Looks up a base colour by its recovered index (0–39). */
export function basePaletteColor(index: number): PaletteColor | undefined {
  return basePalette[index]
}
