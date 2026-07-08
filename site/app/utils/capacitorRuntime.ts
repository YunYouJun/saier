interface SiteCapacitorRuntimeGlobal {
  getPlatform?: () => string
  isNativePlatform?: () => boolean
}

declare global {
  interface Window {
    Capacitor?: SiteCapacitorRuntimeGlobal
  }
}

export function getCapacitorRuntime(): SiteCapacitorRuntimeGlobal | undefined {
  if (!import.meta.client)
    return undefined

  return window.Capacitor
}

export function isCapacitorNativeRuntime(): boolean {
  return getCapacitorRuntime()?.isNativePlatform?.() === true
}
