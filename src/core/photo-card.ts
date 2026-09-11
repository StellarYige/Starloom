import type { Crop, PhotoAsset, PhotoCardState, PhotoSlot, ProjectState } from './types'
import { createProject, SAMPLE_PHOTO_ID } from './project'
export { validCardDate } from './project'
import { normalizeCrop } from './crop'
import { getCardTemplate } from '../templates/photo-cards'

export const photoSlots = ['first', 'second'] as const
export const isPhotoCard = (
  project: ProjectState,
): project is ProjectState & { card: PhotoCardState } => project.version === 3 && !!project.card

export function createPhotoCard(): ProjectState {
  return {
    ...createProject(),
    version: 3,
    templateId: 'photo-strip',
    wish: '把喜欢的日常，慢慢收藏。',
    cropsByTemplate: {},
    card: {
      secondPhotoId: SAMPLE_PHOTO_ID,
      date: '',
      cropsByLayout: {
        'photo-strip': {
          first: { x: 0.5, y: 0.4, zoom: 1 },
          second: { x: 0.5, y: 0.5, zoom: 1.4 },
        },
      },
    },
  }
}
export function photoIds(project: ProjectState) {
  return isPhotoCard(project) ? [project.photoId, project.card.secondPhotoId] : [project.photoId]
}
export function cardCrop(project: ProjectState, slot: PhotoSlot): Crop {
  if (!isPhotoCard(project)) throw new Error('当前作品不是电子小卡。')
  return project.card.cropsByLayout[project.templateId][slot]
}
export function updateCardCrop(project: ProjectState, slot: PhotoSlot, crop: Crop): ProjectState {
  if (!isPhotoCard(project)) return project
  return {
    ...project,
    card: {
      ...project.card,
      cropsByLayout: {
        ...project.card.cropsByLayout,
        [project.templateId]: { ...project.card.cropsByLayout[project.templateId], [slot]: crop },
      },
    },
  }
}
export function switchCardLayout(
  project: ProjectState,
  templateId: string,
  photos: Record<PhotoSlot, Pick<PhotoAsset, 'width' | 'height'>>,
): ProjectState {
  if (!isPhotoCard(project) || project.templateId === templateId) return project
  const template = getCardTemplate(templateId)
  if (project.card.cropsByLayout[templateId]) return { ...project, templateId }
  const crops = { ...project.card.cropsByLayout[project.templateId] }
  for (const slot of photoSlots) {
    const frame = template.layout.layers.find(
      (layer) => layer.type === 'photo' && layer.slot === slot,
    )
    if (!frame || frame.type !== 'photo') throw new Error('布局缺少照片区域。')
    crops[slot] = normalizeCrop(photos[slot].width, photos[slot].height, frame, crops[slot])
  }
  return {
    ...project,
    templateId,
    card: {
      ...project.card,
      cropsByLayout: { ...project.card.cropsByLayout, [templateId]: crops },
    },
  }
}
export function replaceCardPhoto(
  project: ProjectState,
  photoId: string,
  slot: PhotoSlot,
): ProjectState {
  if (!isPhotoCard(project)) return project
  // Reset just this slot in every remembered layout. The other photo is untouched.
  const cropsByLayout = Object.fromEntries(
    Object.entries(project.card.cropsByLayout).map(([id, crops]) => [
      id,
      { ...crops, [slot]: { x: 0.5, y: 0.5, zoom: 1 } },
    ]),
  )
  return {
    ...project,
    photoId: slot === 'first' ? photoId : project.photoId,
    card: {
      ...project.card,
      secondPhotoId: slot === 'second' ? photoId : project.card.secondPhotoId,
      cropsByLayout,
    },
  }
}
