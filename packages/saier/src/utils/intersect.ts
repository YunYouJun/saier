import type { Container } from 'pixi.js'

/**
 * AABB axis-aligned bounding boxes
 */
export function isAABBIntersect(containerA: Container, containerB: Container) {
  const aBounds = containerA.getBounds()
  const bBounds = containerB.getBounds()

  return aBounds.x < bBounds.x + bBounds.width
    && aBounds.x + aBounds.width > bBounds.x
    && aBounds.y < bBounds.y + bBounds.height
    && aBounds.y + aBounds.height > bBounds.y
}
