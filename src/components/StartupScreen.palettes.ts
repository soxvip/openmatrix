/**
 * Color palettes for the startup splash logo.
 * Selected via /logo, persisted in GlobalConfig.logoColor.
 */

export type RGB = readonly [number, number, number]

export type LogoPalette = {
  /** Gradient stops painted top→bottom across the ASCII logo rows. */
  gradient: readonly RGB[]
  /** Highlight color for tagline, version label, and the ✦ marker. */
  accent: RGB
  /** Soft body text color (tagline value, label values). */
  cream: RGB
  /** Dim color for label names and the openclaude prefix. */
  dim: RGB
  /** Box-drawing border color. */
  border: RGB
}

export const LOGO_PALETTES = {
  sunset: {
    gradient: [
      [102, 255, 140],
      [51, 255, 102],
      [0, 255, 65],
      [0, 204, 51],
      [0, 153, 38],
      [0, 102, 26],
    ],
    accent: [0, 255, 65],
    cream: [141, 242, 141],
    dim: [0, 153, 38],
    border: [0, 102, 26],
  },
  forest: {
    gradient: [
      [180, 240, 170],
      [130, 215, 130],
      [85, 180, 95],
      [55, 145, 75],
      [40, 110, 60],
      [25, 80, 45],
    ],
    accent: [120, 200, 120],
    cream: [200, 220, 190],
    dim: [90, 120, 90],
    border: [70, 95, 70],
  },
  ocean: {
    gradient: [
      [170, 220, 255],
      [125, 185, 240],
      [80, 150, 220],
      [55, 115, 190],
      [40, 85, 150],
      [25, 55, 110],
    ],
    accent: [110, 180, 230],
    cream: [195, 215, 235],
    dim: [90, 115, 145],
    border: [70, 90, 115],
  },
  monochrome: {
    gradient: [
      [225, 225, 225],
      [195, 195, 195],
      [160, 160, 160],
      [125, 125, 125],
      [95, 95, 95],
      [70, 70, 70],
    ],
    accent: [200, 200, 200],
    cream: [210, 210, 210],
    dim: [120, 120, 120],
    border: [95, 95, 95],
  },
} as const satisfies Record<string, LogoPalette>

export type LogoPaletteName = keyof typeof LOGO_PALETTES

export const LOGO_PALETTE_NAMES = Object.keys(LOGO_PALETTES) as LogoPaletteName[]

export const DEFAULT_LOGO_PALETTE: LogoPaletteName = 'sunset'

export const LOGO_PALETTE_LABELS: Record<LogoPaletteName, string> = {
  sunset: 'Matrix green (default)',
  forest: 'Forest green',
  ocean: 'Ocean blue',
  monochrome: 'Monochrome',
}

export function isLogoPaletteName(value: unknown): value is LogoPaletteName {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(LOGO_PALETTES, value)
  )
}

export function resolveLogoPalette(name: string | undefined): LogoPalette {
  return isLogoPaletteName(name)
    ? LOGO_PALETTES[name]
    : LOGO_PALETTES[DEFAULT_LOGO_PALETTE]
}
