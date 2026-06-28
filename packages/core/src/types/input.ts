/**
 * A single sampled pointer input, already projected into **document space**.
 *
 * All brush math operates in document space (decision D2), independent of
 * zoom / DPR. The input pipeline's sole job is `screen pointer → document point`.
 */
export interface BrushInputPoint {
  /** document space x */
  x: number
  /** document space y */
  y: number
  /**
   * Normalized pressure in `0..1`.
   *
   * When the device has no real pressure (mouse), the **upstream** decides the
   * fallback — do not hardcode `0.5` here.
   */
  pressure: number
  /**
   * Whether `pressure` came from a pressure-capable device.
   *
   * Mouse input commonly reports `0` or `0.5` depending on browser/button
   * state; downstream pressure fallback logic must look at this flag instead
   * of treating that value as real stylus pressure.
   */
  hasPressure?: boolean
  /** Pointer device type, when the sampler knows it. */
  pointerType?: 'mouse' | 'pen' | 'touch' | string
  /** pen tilt along x, if available */
  tiltX?: number
  /** pen tilt along y, if available */
  tiltY?: number
  /** pen barrel rotation, if available */
  twist?: number
  /** monotonic timestamp in ms, from `event.timeStamp` */
  time: number
}
