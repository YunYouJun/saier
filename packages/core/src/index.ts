/**
 * `@saier/core` — the Pixi-agnostic raster painting engine.
 *
 * Public surface: contracts (types), pure geometry / color helpers, the
 * deterministic brush engine, and the framework-agnostic document / undo model.
 * It must never import `pixi.js` (enforced by the dependency graph, decision D8).
 */

export * from './brush'
export * from './controller'
export * from './document'
export * from './format'
export * from './input'
export * from './math'
export * from './surface'
export * from './types'
