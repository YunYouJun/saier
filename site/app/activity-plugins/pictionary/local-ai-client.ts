import type { PictionaryAiEffect } from '@saier/collaboration'

/** Contact only the explicitly paired loopback image companion. */
export async function requestLocalAiImage(input: {
  effect: PictionaryAiEffect
  imageDataUrl: string
  pairingCode: string
  port: number
  signal: AbortSignal
}): Promise<string> {
  if (!Number.isInteger(input.port) || input.port < 1024 || input.port > 65535 || !/^[a-f\d]{64}$/iu.test(input.pairingCode))
    throw new Error('Invalid local connection settings')
  const response = await fetch(`http://127.0.0.1:${input.port}/generate`, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    headers: { 'Authorization': `Bearer ${input.pairingCode}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl: input.imageDataUrl, effect: input.effect }),
    signal: input.signal,
  })
  if (!response.ok)
    throw new Error('Local generation failed')
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object' || !('imageDataUrl' in result) || typeof result.imageDataUrl !== 'string')
    throw new Error('Invalid local generation result')
  input.signal.throwIfAborted()
  return normalizeLocalAiImage(result.imageDataUrl)
}

/** Decode and normalize before preview/upload; never load remote result URLs. */
export async function normalizeLocalAiImage(dataUrl: string): Promise<string> {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(dataUrl)
  if (!match || dataUrl.length > 17_000_000)
    throw new Error('Invalid generated image')
  const bytes = Uint8Array.from(atob(match[2]!), character => character.charCodeAt(0))
  const image = await createImageBitmap(new Blob([bytes], { type: `image/${match[1]}` }))
  try {
    if (image.width !== image.height || image.width < 64 || image.width > 4096)
      throw new Error('Generated image must be a square between 64 and 4096 pixels')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Canvas 2D is unavailable')
    context.drawImage(image, 0, 0, 512, 512)
    return canvas.toDataURL('image/png')
  }
  finally {
    image.close()
  }
}
