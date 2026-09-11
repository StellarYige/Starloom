import { birthdayLetter } from './birthday-letter'
import { heartPolaroid } from './heart-polaroid'
import { centerStage } from './center-stage'
import { getCardTemplate } from './photo-cards'
import type { ArtworkFormat, ProjectState } from '../core/types'
export const templates = [birthdayLetter, heartPolaroid, centerStage]
export function getTemplate(id: string) {
  const template = templates.find((item) => item.id === id)
  if (!template) throw new Error('这份草稿使用的主题尚未安装。')
  return template
}
export function artworkTemplate(project: ProjectState) {
  return project.version === 3
    ? getCardTemplate(project.templateId)
    : getTemplate(project.templateId)
}
export function artworkLayout(project: ProjectState, format: ArtworkFormat) {
  if (project.version === 3 && format === 'card') return getCardTemplate(project.templateId).layout
  if (project.version !== 2 || format === 'card') throw new Error('作品与成品类型不匹配。')
  return getTemplate(project.templateId).layouts[format]
}
