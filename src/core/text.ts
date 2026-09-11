import { graphemes } from './project'

export interface TextFit {
  lines: string[]
  size: number
  lineHeight: number
  overflow: boolean
}
/** Grapheme-aware wrapping also handles long Latin words without spaces. */
export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const char of graphemes(paragraph)) {
      if (line && measure(line + char) > width) {
        lines.push(line.trimEnd())
        line = char.trimStart()
      } else line += char
    }
    lines.push(line.trimEnd())
  }
  return lines
}
export function fitText(
  text: string,
  width: number,
  height: number,
  maxSize: number,
  minSize: number,
  lineHeight: number,
  maxLines: number,
  measure: (text: string, size: number) => number,
): TextFit {
  let last: TextFit = {
    lines: [],
    size: minSize,
    lineHeight: minSize * lineHeight,
    overflow: false,
  }
  for (let size = maxSize; size >= minSize; size -= 1) {
    const lines = wrapText(text, width, (line) => measure(line, size))
    const overflow =
      lines.length > maxLines ||
      lines.length * size * lineHeight > height ||
      lines.some((line) => measure(line, size) > width + 0.01)
    last = { lines, size, lineHeight: size * lineHeight, overflow }
    if (!overflow) return last
  }
  return last
}
