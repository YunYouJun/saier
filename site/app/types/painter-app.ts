export type SitePainterTool = 'brush' | 'drag' | 'eraser' | 'image' | 'selection'

export type SitePainterMenuCommand
  = | 'file:new'
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
