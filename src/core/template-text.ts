import { artworkTemplate } from '../templates'
import type { Decoration, ProjectState, TemplateText } from './types'

export function templateTextFields(project: ProjectState) {
  const template = artworkTemplate(project)
  const layouts = 'layout' in template ? { card: template.layout } : template.layouts
  const fields: { id: string; literal: string; label: string; decoration?: Decoration }[] = []
  for (const [format, layout] of Object.entries(layouts)) {
    let index = 0
    for (const layer of layout.layers) {
      if (layer.type !== 'text' || typeof layer.content !== 'object') continue
      fields.push({
        ...layer.content,
        label: `${format === 'avatar' ? '头像' : format === 'poster' ? '贺图' : '小卡'}文案 ${++index}`,
        decoration: layer.decoration,
      })
    }
  }
  return fields
}

export function updateTemplateText(
  project: ProjectState,
  id: string,
  value: TemplateText | null,
): ProjectState {
  const entries = { ...project.templateTexts?.[project.templateId] }
  if (value) entries[id] = value
  else delete entries[id]
  const templateTexts = { ...project.templateTexts, [project.templateId]: entries }
  if (!Object.keys(entries).length) delete templateTexts[project.templateId]
  const next: ProjectState = { ...project, templateTexts }
  if (!Object.keys(templateTexts).length) delete next.templateTexts
  return next
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function validTemplateTexts(value: unknown) {
  return (
    value === undefined ||
    (isRecord(value) &&
      Object.keys(value).length <= 50 &&
      Object.entries(value).every(
        ([template, entries]) =>
          /^[a-z][a-z0-9-]{0,79}$/.test(template) &&
          isRecord(entries) &&
          Object.keys(entries).length <= 100 &&
          Object.entries(entries).every(
            ([id, entry]) =>
              /^[a-z][a-z0-9-]{0,79}$/.test(id) &&
              isRecord(entry) &&
              typeof entry.text === 'string' &&
              entry.text.length <= 10000 &&
              typeof entry.hidden === 'boolean',
          ),
      ))
  )
}
