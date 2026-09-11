import type { ColorMode, ColorToken } from './types'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
export function mix(a: string, b: string, amount: number) {
  const other = rgb(b)
  return (
    '#' +
    rgb(a)
      .map((v, i) =>
        Math.round(v * (1 - amount) + other[i] * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}
export function palette(color: string, mode: ColorMode = 'light'): Record<ColorToken, string> {
  const accent = /^#[\da-f]{6}$/i.test(color) ? color : '#75866b'
  if (mode === 'dark')
    return {
      accent,
      paper: mix('#111519', accent, 0.045),
      soft: mix('#252b31', accent, 0.15),
      ink: '#fbfaf6',
      muted: '#c6cbd0',
      white: '#ffffff',
      onAccent: contrast(accent, '#ffffff') >= contrast(accent, '#000000') ? '#ffffff' : '#000000',
    }
  return {
    accent,
    paper: mix('#fffdf7', accent, 0.035),
    soft: mix('#fffdf7', accent, 0.19),
    ink: mix('#272c26', accent, 0.15),
    muted: mix('#4e554a', accent, 0.18),
    white: '#ffffff',
    onAccent: contrast(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#171c16',
  }
}
