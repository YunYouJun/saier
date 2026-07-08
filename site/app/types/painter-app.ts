export type SitePainterTool = 'brush' | 'drag' | 'eraser' | 'image' | 'selection'

export type SitePainterPanelId = 'controls' | 'diagnostics' | 'layers' | 'navigator' | 'options'

export type SitePainterColorSectionId = 'palette' | 'rgbSliders' | 'wheel'

export type SitePainterCommandCategory
  = | 'app'
    | 'brush'
    | 'edit'
    | 'file'
    | 'filter'
    | 'layers'
    | 'recording'
    | 'selection'
    | 'tools'
    | 'view'

export type SitePainterAppCommand = 'app:keyboard-shortcuts'

export type SitePainterBrushCommand = 'brush:size-down' | 'brush:size-up'

export type SitePainterSelectionCommand = 'selection:cancel'

export type SitePainterFilterCommand = 'filter:grayscale' | 'filter:invert'

export type SitePainterRecordingCommand
  = | 'recording:toggle'
    | 'recording:replay-last'
    | 'recording:clear'
    | 'recording:export-log'
    | 'recording:import-log'
    | 'recording:pause'
    | 'recording:play'
    | 'recording:seek-start'
    | 'recording:step-forward'

export type SitePainterViewCommand = 'view:reset' | 'view:zoom-in' | 'view:zoom-out'

export type SitePainterToolCommand = `tool:${SitePainterTool}`

export type SitePainterCommand
  = | 'file:new'
    | 'file:open-project'
    | 'file:save-project'
    | 'file:cloud-sync'
    | 'file:cloud-room'
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
    | SitePainterRecordingCommand
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
