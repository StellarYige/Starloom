import { describe, expect, it } from 'vitest'
import { templates } from '../templates'
import { contrast, palette } from './color'
import { historyReducer, initialHistory } from './history'
import { createProject, projectCrop, replacePhoto, switchTemplate, updateCrop } from './project'

describe('three paired birthday layouts', () => {
  it('keeps both export dimensions and one independently composed photo slot in every theme', () => {
    expect(templates).toHaveLength(3)
    expect(new Set(templates.map((t) => t.id)).size).toBe(3)
    for (const template of templates) {
      expect(template.layouts.avatar.exportWidth).toBe(1600)
      expect(template.layouts.avatar.exportHeight).toBe(1600)
      expect(template.layouts.poster.exportWidth).toBe(2400)
      expect(template.layouts.poster.exportHeight).toBe(3000)
      const frames = Object.values(template.layouts).map((layout) =>
        layout.layers.filter((layer) => layer.type === 'photo'),
      )
      expect(frames.every((frames) => frames.length === 1)).toBe(true)
      expect(frames[0]).not.toEqual(frames[1])
    }
  })
  it('initializes target crops within bounds and remembers each theme independently', () => {
    for (const photo of [
      { width: 4000, height: 1000 },
      { width: 1000, height: 4000 },
    ]) {
      const first = updateCrop(createProject(), 'avatar', { x: 0.25, y: 0.65, zoom: 2 })
      const second = updateCrop(switchTemplate(first, 'heart-polaroid', photo), 'poster', {
        x: 0.6,
        y: 0.4,
        zoom: 3,
      })
      const third = switchTemplate(second, 'center-stage', photo)
      const restored = switchTemplate(third, first.templateId, photo)
      expect(restored.cropsByTemplate[first.templateId]).toEqual(
        first.cropsByTemplate[first.templateId],
      )
      expect(projectCrop(switchTemplate(restored, 'heart-polaroid', photo), 'poster').zoom).toBe(3)
      expect(third.name).toBe(first.name)
      expect(third.color).toBe(first.color)
      for (const crop of Object.values(third.cropsByTemplate['center-stage'])) {
        expect(crop.x).toBeGreaterThanOrEqual(0)
        expect(crop.x).toBeLessThanOrEqual(1)
        expect(crop.y).toBeGreaterThanOrEqual(0)
        expect(crop.y).toBeLessThanOrEqual(1)
      }
    }
  })
  it('undoes switching as one step and restores all crop memories when undoing photo replacement', () => {
    const first = createProject()
    const second = switchTemplate(first, 'center-stage', { width: 800, height: 1200 })
    let history = historyReducer(initialHistory(first), { type: 'change', value: second })
    expect(historyReducer(history, { type: 'undo' }).present).toEqual(first)
    const replaced = replacePhoto(second, 'new-photo')
    expect(Object.keys(replaced.cropsByTemplate)).toEqual(['center-stage'])
    history = historyReducer(history, { type: 'change', value: replaced })
    expect(historyReducer(history, { type: 'undo' }).present).toEqual(second)
    expect(initialHistory(replaced).past).toEqual([])
  })
  it('preserves the light palette and gives dark text and accent labels sufficient contrast', () => {
    for (const color of [
      '#000000',
      '#ffffff',
      '#ffff00',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#75866b',
      '#787878',
    ]) {
      expect(palette(color, 'light')).toEqual(palette(color))
      const dark = palette(color, 'dark')
      expect(dark.accent).toBe(color)
      expect(contrast(dark.ink, dark.paper)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark.muted, dark.paper)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark.onAccent, dark.accent)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
