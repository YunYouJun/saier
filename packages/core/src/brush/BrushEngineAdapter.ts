import type {
  BrushEngineDescriptor,
  BrushEngineFactory,
  BrushEngineRegistration,
} from './BrushPreset'

export interface AsyncBrushEngineRegistrationOptions extends BrushEngineDescriptor {
  load: () => Promise<BrushEngineFactory>
}

/**
 * Loads an async engine adapter before registering it with core.
 *
 * The returned registration is still fully synchronous on the stroke hot path:
 * WASM downloads / initialization happen before `BrushEngineRegistry.register`.
 */
export async function loadBrushEngineRegistration(
  options: AsyncBrushEngineRegistrationOptions,
): Promise<BrushEngineRegistration> {
  const { load, ...descriptor } = options
  const create = await load()
  return { ...descriptor, create }
}
