export type SitePainterTool = 'brush' | 'drag' | 'eraser' | 'image' | 'selection'

export type SitePainterMenuCommand
  = | 'file:new'
    | 'file:open-project'
    | 'file:save-project'
    | 'file:import-image'
    | 'file:export-preview'
    | 'file:download'
    | 'edit:undo'
    | 'edit:redo'
    | 'view:zoom-in'
    | 'view:zoom-out'
    | 'layer:add'
    | 'layer:move-up'
    | 'layer:move-down'
    | 'layer:remove'
    | `tool:${SitePainterTool}`

export interface SiteNewCanvasRequest {
  name: string
  width: number
  height: number
}
