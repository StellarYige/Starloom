import { birthdayLetter } from './birthday-letter'
export const templates = [birthdayLetter]
export function getTemplate(id: string) {
  const template = templates.find((item) => item.id === id)
  if (!template) throw new Error('这份草稿使用的主题尚未安装。')
  return template
}
