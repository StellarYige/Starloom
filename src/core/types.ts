export type Format = 'avatar' | 'poster'
export type ColorMode = 'light' | 'dark'
export type ColorToken = 'paper' | 'ink' | 'muted' | 'accent' | 'soft' | 'white' | 'onAccent'
export type Decoration = 'sparkles' | 'lines'
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export interface Crop {
  x: number
  y: number
  zoom: number
}
export interface ProjectState {
  version: 2
  templateId: string
  photoId: string
  name: string
  month: number
  day: number
  wish: string
  color: string
  decorations: Record<Decoration, boolean>
  cropsByTemplate: Record<string, Record<Format, Crop>>
}
export type LegacyProjectState = Omit<ProjectState, 'version' | 'cropsByTemplate'> & {
  version: 1
  crops: Record<Format, Crop>
}
export interface PhotoAsset {
  id: string
  blob: Blob
  name: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  sample: boolean
}
interface BaseLayer {
  decoration?: Decoration
}
export interface TextLayer extends BaseLayer, Rect {
  type: 'text'
  content: 'name' | 'birthday' | 'wish' | { literal: string }
  font: 'sans' | 'serif'
  weight?: 400 | 500 | 600
  italic?: boolean
  size: number
  minSize?: number
  lineHeight?: number
  maxLines?: number
  align?: 'left' | 'center' | 'right'
  vertical?: 'top' | 'center'
  tracking?: number
  color: ColorToken
}
export type Layer =
  | TextLayer
  | (BaseLayer &
      Rect & {
        type: 'rect'
        color: ColorToken
        radius?: number
        opacity?: number
        stroke?: boolean
        lineWidth?: number
      })
  | (BaseLayer & Rect & { type: 'photo'; radius?: number })
  | (BaseLayer & {
      type: 'line'
      x: number
      y: number
      x2: number
      y2: number
      color: ColorToken
      lineWidth?: number
    })
  | (BaseLayer & { type: 'sparkle'; x: number; y: number; size: number; color: ColorToken })
export interface Layout {
  width: number
  height: number
  exportWidth: number
  exportHeight: number
  layers: Layer[]
}
export interface TemplateDefinition {
  id: string
  version: number
  name: string
  subtitle: string
  tags: string[]
  colorMode?: ColorMode
  palettes: { name: string; color: string }[]
  layouts: Record<Format, Layout>
}
