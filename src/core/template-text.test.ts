import { describe, expect, it } from 'vitest'
import { templates } from '../templates'
import { cardTemplates } from '../templates/photo-cards'
import { createPhotoCard } from './photo-card'
import { historyReducer, initialHistory } from './history'
import { createProject, switchTemplate, validateContent } from './project'
import { textContent } from './render'
import { templateTextFields, updateTemplateText, validTemplateTexts } from './template-text'

describe('template decoration copy', () => {
  it('gives every fixed text a stable unique editable ID while preserving all defaults', () => {
    for (const template of [...templates, ...cardTemplates]) {
      const project = {
        ...('layout' in template ? createPhotoCard() : createProject()),
        templateId: template.id,
      }
      const layouts = 'layout' in template ? [template.layout] : Object.values(template.layouts)
      const literals = layouts
        .flatMap((layout) => layout.layers)
        .filter((layer) => layer.type === 'text' && typeof layer.content === 'object')
      const fields = templateTextFields(project)
      expect(fields).toHaveLength(literals.length)
      expect(new Set(fields.map((field) => field.id)).size).toBe(fields.length)
      for (const layer of literals)
        if (layer.type === 'text' && typeof layer.content === 'object')
          expect(textContent(layer, project)).toBe(layer.content.literal)
    }
  })

  it('edits, hides, restores defaults and undoes changes independently across templates', () => {
    const original = createProject()
    const layer = templates[0].layouts.poster.layers.find(
      (layer) => layer.type === 'text' && typeof layer.content === 'object',
    )!
    if (layer.type !== 'text') throw new Error('Expected text')
    const changed = updateTemplateText(original, 'poster-kicker', {
      text: '我的纪念日',
      hidden: false,
    })
    expect(textContent(layer, changed)).toBe('我的纪念日')
    const hidden = updateTemplateText(changed, 'poster-kicker', {
      text: '我的纪念日',
      hidden: true,
    })
    expect(textContent(layer, hidden)).toBe('')
    const other = switchTemplate(hidden, 'heart-polaroid', { width: 1200, height: 1600 })
    expect(other.templateTexts).toEqual(hidden.templateTexts)
    const history = historyReducer(initialHistory(changed), { type: 'change', value: hidden })
    expect(historyReducer(history, { type: 'undo' }).present).toEqual(changed)
    expect(
      historyReducer(historyReducer(history, { type: 'undo' }), { type: 'redo' }).present,
    ).toEqual(hidden)
    expect(updateTemplateText(hidden, 'poster-kicker', null)).toEqual(original)
  })

  it('keeps empty text empty, validates visible lengths and safely accepts old records', () => {
    const original = createProject()
    const long = updateTemplateText(original, 'poster-kicker', {
      text: '星'.repeat(81),
      hidden: false,
    })
    expect(validateContent(long)).toContain('每条装饰文案最多 80 个字符，请稍作精简或隐藏。')
    expect(
      validateContent(
        updateTemplateText(long, 'poster-kicker', { text: '星'.repeat(81), hidden: true }),
      ),
    ).toEqual([])
    const layer = templates[0].layouts.poster.layers[0]
    if (layer.type !== 'text') throw new Error('Expected text')
    expect(
      textContent(
        layer,
        updateTemplateText(original, 'poster-kicker', { text: '', hidden: false }),
      ),
    ).toBe('')
    expect(validTemplateTexts(undefined)).toBe(true)
    for (const bad of [null, [], { theme: [] }, { theme: { text: { text: 'ok', hidden: 1 } } }])
      expect(validTemplateTexts(bad)).toBe(false)
  })
})
