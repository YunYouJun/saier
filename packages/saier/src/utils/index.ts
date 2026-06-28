export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function isWindows() {
  return navigator.userAgent.includes('Windows')
}
