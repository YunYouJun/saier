export type SitePainterTool = 'brush' | 'drag' | 'eraser' | 'image' | 'selection'

export type SitePainterPanelId = 'controls' | 'diagnostics' | 'layers' | 'options'

export type SitePainterColorSectionId = 'palette' | 'rgbSliders' | 'wheel'

export type SitePainterCommandCategory
  = | 'app'
    | 'brush'
    | 'edit'
    | 'file'
    | 'filter'
    | 'layers'
    | 'selection'
    | 'tools'
    | 'view'

export type SitePainterAppCommand = 'app:keyboard-shortcuts'

export type SitePainterBrushCommand = 'brush:size-down' | 'brush:size-up'

export type SitePainterSelectionCommand = 'selection:cancel'

export type SitePainterFilterCommand = 'filter:grayscale' | 'filter:invert'

export type SitePainterViewCommand = 'view:reset' | 'view:zoom-in' | 'view:zoom-out'

export type SitePainterToolCommand = `tool:${SitePainterTool}`

export type SitePainterCommand
  = | 'file:new'
    | 'file:open-project'
    | 'file:save-project'
    | 'file:cloud-sync'
    | 'file:import-image'
    | 'file:import-brush'
    | 'file:export-preview'
    | 'file:download'
    | 'edit:undo'
    | 'edit:redo'
    | SitePainterViewCommand
    | 'filter:repeat'
    | SitePainterFilterCommand
    | 'layer:add'
    | 'layer:add-group'
    | 'layer:move-up'
    | 'layer:move-down'
    | 'layer:remove'
    | SitePainterToolCommand
    | SitePainterBrushCommand
    | SitePainterSelectionCommand
    | SitePainterAppCommand

export type SitePainterMenuCommand = SitePainterCommand

export interface SitePainterCommandDefinition {
  id: SitePainterCommand
  category: SitePainterCommandCategory
}

export interface SiteKeyboardShortcutRow {
  id: SitePainterCommand
  category: SitePainterCommandCategory
  categoryLabel: string
  label: string
  shortcutLabel: string
}

export interface SiteNewCanvasRequest {
  name: string
  width: number
  height: number
}
