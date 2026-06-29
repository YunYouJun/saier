import type { DirtyRect } from '@saier/core'

/**
 * How a layer's derived display is masked.
 * - `alpha`: clip by the mask layer's alpha — used by clipping layers.
 * - `luminance`: reveal by the mask layer's BT.601 grayscale luminance — used
 *   by layer masks.
 */
export type DisplayMaskMode = 'alpha' | 'luminance'

/**
 * Optional Pixi-side display capability for backends that can expose a
 * non-destructive derived layer texture/container for clipping and masks.
 */
export interface DisplayMaskCapableBackend {
  /** Whether a paintable layer or hidden mask surface exists. */
  hasLayer: (id: string) => boolean
  /** Create a paintable surface that is not shown as a normal layer. */
  createHiddenLayer: (id: string) => void
  /** Fill a surface fully opaque white, used for fresh reveal-all masks. */
  fillLayerOpaque: (id: string) => void
  /** Display `layerId` through `maskLayerId`, or clear the derived display. */
  setLayerDisplayMask: (layerId: string, maskLayerId: string | undefined, mode?: DisplayMaskMode) => void
  /** Recompute derived displays after source pixels change. */
  refreshDerivedDisplays: (dirtyRect?: DirtyRect) => void
}
