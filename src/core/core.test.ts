import { describe, expect, it } from 'vitest'
import { cropGeometry, dragCrop, normalizeCrop } from './crop'
import { countCharacters, createProject, daysInMonth, validateContent } from './project'
import { contrast, palette } from './color'
import { historyReducer, initialHistory } from './history'
import { fitText, wrapText } from './text'
import { birthdayLetter } from '../templates/birthday-letter'

describe('photo crop geometry', () => {
  for (const [width, height] of [
    [1200, 1200],
    [6000, 1500],
    [1500, 6000],
    [1, 8000],
    [8000, 1],
  ]) {
    it(`covers both independent frames for ${width} × ${height}`, () => {
      for (const layout of Object.values(birthdayLetter.layouts)) {
        const frame = layout.layers.find((layer) => layer.type === 'photo')!
        for (const zoom of [1, 1.6, 4])
          for (const x of [-10, 0, 0.5, 1, 10]) {
            const crop = { x, y: 1 - x, zoom }
            const g = cropGeometry(width, height, frame, crop)
            expect(g.sourceX).toBeGreaterThanOrEqual(-1e-7)
            expect(g.sourceY).toBeGreaterThanOrEqual(-1e-7)
            expect(g.sourceX + g.sourceWidth).toBeLessThanOrEqual(width + 1e-7)
            expect(g.sourceY + g.sourceHeight).toBeLessThanOrEqual(height + 1e-7)
            expect(g.sourceWidth / g.sourceHeight).toBeCloseTo(frame.width / frame.height, 6)
            const normalized = normalizeCrop(width, height, frame, crop)
            expect(normalized.x).toBeGreaterThanOrEqual(0)
            expect(normalized.y).toBeLessThanOrEqual(1)
          }
      }
    })
  }
  it('dragging the photo right reveals the source to the left, and clamps at its edge', () => {
    const frame = { x: 0, y: 0, width: 800, height: 600 }
    const start = { x: 0.5, y: 0.5, zoom: 2 }
    const next = dragCrop(2000, 2000, frame, start, 80, 0)
    expect(next.x).toBeCloseTo(0.45)
    expect(next.y).toBe(0.5)
    const edge = dragCrop(2000, 2000, frame, start, 100000, 100000)
    expect(cropGeometry(2000, 2000, frame, edge).sourceX).toBeCloseTo(0)
  })
})

describe('text boundaries', () => {
  it('counts whole emoji and combining marks as single graphemes', () =>
    expect(countCharacters('星👨‍👩‍👧‍👦e\u0301🌟')).toBe(4))
  it('wraps long Latin strings and preserves paragraph boundaries', () => {
    expect(wrapText('ABCDEFGHI\n\n星迹', 3, (s) => countCharacters(s))).toEqual([
      'ABC',
      'DEF',
      'GHI',
      '',
      '星迹',
    ])
  })
  it('fits 200 Chinese characters completely into the blessing box', () => {
    const text = '愿你一直自由快乐幸福闪耀'.repeat(20).slice(0, 200)
    const fit = fitText(text, 874, 136, 24, 18, 1.5, 5, (s, size) => countCharacters(s) * size)
    expect(fit.overflow).toBe(false)
    expect(fit.lines.join('')).toBe(text)
    expect(fit.lines.length * fit.lineHeight).toBeLessThanOrEqual(136)
  })
  it('reports unfit manual line breaks without silently truncating text', () => {
    const fit = fitText(
      '一\n二\n三\n四\n五\n六',
      874,
      136,
      24,
      18,
      1.5,
      5,
      (s, size) => s.length * size,
    )
    expect(fit.overflow).toBe(true)
    expect(fit.lines.length).toBe(6)
  })
  it('allows February 29 and rejects invalid days / over-limit input', () => {
    expect(daysInMonth(2)).toBe(29)
    const project = {
      ...createProject(),
      month: 2,
      day: 29,
      name: '晴'.repeat(40),
      wish: '愿'.repeat(200),
    }
    expect(validateContent(project)).toEqual([])
    expect(validateContent({ ...project, day: 30 })).toHaveLength(1)
    expect(
      validateContent({ ...project, name: '晴'.repeat(41), wish: '愿'.repeat(201) }),
    ).toHaveLength(2)
  })
})

describe('undo and redo transactions', () => {
  it('coalesces a gesture, then keeps the next gesture separate', () => {
    let history = initialHistory(0)
    history = historyReducer(history, { type: 'change', value: 1, group: 'drag', now: 100 })
    history = historyReducer(history, { type: 'change', value: 2, group: 'drag', now: 180 })
    expect(history.past).toEqual([0])
    history = historyReducer(history, { type: 'seal' })
    history = historyReducer(history, { type: 'change', value: 3, group: 'drag', now: 200 })
    expect(history.past).toEqual([0, 2])
    history = historyReducer(history, { type: 'undo' })
    expect(history.present).toBe(2)
    history = historyReducer(history, { type: 'redo' })
    expect(history.present).toBe(3)
  })
  it('drops redo on new edits and retains only the last 50 undo steps', () => {
    let history = initialHistory(0)
    for (let i = 1; i <= 60; i++) history = historyReducer(history, { type: 'change', value: i })
    expect(history.past).toHaveLength(50)
    history = historyReducer(history, { type: 'undo' })
    history = historyReducer(history, { type: 'change', value: 70 })
    expect(history.future).toEqual([])
  })
  it('restores the original photo and both independent crops together', () => {
    const first = createProject()
    const next = {
      ...first,
      photoId: 'replacement',
      crops: { avatar: { x: 0.2, y: 0.6, zoom: 2 }, poster: { x: 0.6, y: 0.5, zoom: 3 } },
    }
    const history = historyReducer(
      historyReducer(initialHistory(first), { type: 'change', value: next }),
      { type: 'undo' },
    )
    expect(history.present).toEqual(first)
  })
})

it('keeps text readable for extreme support colors', () => {
  for (const color of ['#ffffff', '#000000', '#ffff00', '#ff0000', '#00ff00', '#0000ff']) {
    const colors = palette(color)
    expect(colors.accent).toBe(color)
    expect(contrast(colors.ink, colors.paper)).toBeGreaterThan(4.5)
    expect(contrast(colors.muted, colors.paper)).toBeGreaterThan(4.5)
  }
})
