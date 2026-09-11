import type { ProjectState } from './types'

export const SAMPLE_PHOTO_ID = 'sample-portrait-v1'
export function createProject(): ProjectState {
  return {
    version: 1,
    templateId: 'birthday-letter',
    photoId: SAMPLE_PHOTO_ID,
    name: '林予安',
    month: 8,
    day: 16,
    wish: '愿你一直被爱，也一直自由。\n新的一岁，继续闪闪发光。',
    color: '#75866B',
    decorations: { sparkles: true, lines: true },
    crops: { avatar: { x: 0.5, y: 0.46, zoom: 1 }, poster: { x: 0.5, y: 0.45, zoom: 1 } },
  }
}
export const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
export const graphemes = (text: string) =>
  Array.from(segmenter.segment(text), (part) => part.segment)
export const countCharacters = (text: string) => graphemes(text).length
export const daysInMonth = (month: number) =>
  [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
export const birthdayText = (project: ProjectState) =>
  `${String(project.month).padStart(2, '0')}.${String(project.day).padStart(2, '0')}`
export function validateContent(project: ProjectState): string[] {
  const issues: string[] = []
  if (!project.name.trim()) issues.push('写下一个名字，让这份心意有所归属。')
  if (countCharacters(project.name) > 40) issues.push('姓名最多 40 个字符，请稍作精简。')
  if (countCharacters(project.wish) > 200) issues.push('祝福语最多 200 个字符，请稍作精简。')
  if (
    !Number.isInteger(project.month) ||
    !Number.isInteger(project.day) ||
    project.day < 1 ||
    project.day > daysInMonth(project.month)
  )
    issues.push('请选择有效的生日。')
  if (!/^#[\da-f]{6}$/i.test(project.color)) issues.push('应援色需要是完整的六位十六进制颜色。')
  return issues
}
