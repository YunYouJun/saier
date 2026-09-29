import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const aiRemix = require('../cloudbase/functions/saier-room-api/pictionary-ai-remix.cjs') as {
  buildAiRemixPrompt: (input: { answer?: string, effect: string }) => string
  createCloudbasePictionaryAiGenerator: (options: Record<string, unknown>) => {
    generate: (input: Record<string, unknown>) => Promise<{ fileId: string }>
  }
  createCloudbasePictionaryImageImporter: (options: Record<string, unknown>) => {
    generate: (input: Record<string, unknown>) => Promise<{ fileId: string }>
  }
  createPictionaryAiRemixService: (options: Record<string, unknown>) => {
    request: (input: Record<string, unknown>, userId: string) => Promise<Record<string, unknown>>
  }
}

describe('pictionary AI remix boundary', () => {
  it('persists normalized local PNG bytes without invoking a model and rejects unsupported images', async () => {
    const uploadFile = vi.fn().mockResolvedValue({ fileID: 'cloud://env/import.png' })
    const ai = vi.fn()
    const importer = aiRemix.createCloudbasePictionaryImageImporter({ app: { ai, uploadFile } })
    // Transport header fixture. Actual image normalization is tested in Chromium.
    const png = Buffer.alloc(33)
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png)
    png.write('IHDR', 12)
    png.writeUInt32BE(512, 16)
    png.writeUInt32BE(512, 20)
    const input = { imageBase64: png.toString('base64'), imageMimeType: 'image/png', storageKey: 'room-storage/saier/room/activities/1/session/ai-remix/import.jpg' }
    await expect(importer.generate(input)).resolves.toEqual({ fileId: 'cloud://env/import.png' })
    expect(uploadFile).toHaveBeenCalledExactlyOnceWith({ cloudPath: input.storageKey.replace('.jpg', '.png'), fileContent: png })
    for (const invalid of [
      { ...input, imageMimeType: 'image/jpeg' },
      { ...input, imageBase64: Buffer.from('not an image').toString('base64') },
      { ...input, imageBase64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') },
    ]) {
      await expect(importer.generate(invalid)).rejects.toThrow('INVALID_AI_REMIX')
    }
    png.writeUInt32BE(4096, 16)
    await expect(importer.generate({ ...input, imageBase64: png.toString('base64') })).rejects.toThrow('INVALID_AI_REMIX')
    expect(uploadFile).toHaveBeenCalledOnce()
    expect(ai).not.toHaveBeenCalled()
  })

  it('uses fixed effects and includes the answer only when the authority supplies it', () => {
    const hidden = aiRemix.buildAiRemixPrompt({ effect: 'polish' })
    const aware = aiRemix.buildAiRemixPrompt({ answer: 'apple', effect: 'polish' })

    expect(hidden).not.toContain('apple')
    expect(aware).toContain('apple')
    expect(hidden).toContain('Do not add text')
    expect(() => aiRemix.buildAiRemixPrompt({ effect: 'free-form' })).toThrow('INVALID_AI_REMIX')
  })

  it('calls the CloudBase I2I model and persists the expiring result immediately', async () => {
    const generateImage = vi.fn().mockResolvedValue({ data: [{ url: 'https://example.com/generated' }] })
    const uploadFile = vi.fn().mockResolvedValue({ fileID: 'cloud://env/remix.jpg' })
    const generator = aiRemix.createCloudbasePictionaryAiGenerator({
      app: {
        ai: () => ({ createImageModel: () => ({ generateImage }) }),
        uploadFile,
      },
      downloadImage: vi.fn().mockResolvedValue(Buffer.from('image')),
    })

    await expect(generator.generate({
      effect: 'texture',
      imageBase64: 'aW1hZ2U=',
      storageKey: 'room-storage/saier/room/activities/1/session/ai-remix/request.jpg',
    })).resolves.toEqual({ fileId: 'cloud://env/remix.jpg' })
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
      images: ['aW1hZ2U='],
      model: 'HY-Image-v3.0-I2I-ToB-v1.0.1',
      revise: { value: false },
      size: '1024x1024',
    }))
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      cloudPath: expect.stringContaining('/ai-remix/'),
      fileContent: Buffer.from('image'),
    }))
  })

  it.each(['image/png', 'image/jpeg'])('routes Seedream through the configured CloudBase provider with %s input', async (imageMimeType) => {
    const generateImage = vi.fn().mockResolvedValue({ data: [{ url: 'https://example.com/seedream' }] })
    const generateImageSubUrlConfig: Record<string, Array<[RegExp, string]>> = {}
    const createImageModel = vi.fn().mockReturnValue({ generateImage, generateImageSubUrlConfig })
    const downloadImage = vi.fn().mockResolvedValue(Buffer.from('generated'))
    const uploadFile = vi.fn().mockResolvedValue({ fileID: 'cloud://env/remix.jpg' })
    const generator = aiRemix.createCloudbasePictionaryAiGenerator({
      adapter: 'seedream',
      app: { ai: () => ({ createImageModel }), uploadFile },
      downloadImage,
      model: 'doubao-seedream-5-0-flash-260915',
      provider: 'custom-ark-image',
    })

    await expect(generator.generate({
      effect: 'polish',
      imageBase64: 'aW1hZ2U=',
      imageMimeType,
      model: 'client-cannot-select-model',
      provider: 'client-cannot-select-provider',
      storageKey: 'room-storage/saier/room/activities/1/session/ai-remix/request.jpg',
    })).resolves.toEqual({ fileId: 'cloud://env/remix.jpg' })

    expect(createImageModel).toHaveBeenCalledWith('custom-ark-image')
    const [pattern, subpath] = generateImageSubUrlConfig['custom-ark-image'][0]!
    expect(pattern.test('doubao-seedream-5-0-flash-260915')).toBe(true)
    expect(subpath).toBe('images/generations')
    expect(generateImage).toHaveBeenCalledExactlyOnceWith({
      image: `data:${imageMimeType};base64,aW1hZ2U=`,
      model: 'doubao-seedream-5-0-flash-260915',
      output_format: 'jpeg',
      prompt: aiRemix.buildAiRemixPrompt({ effect: 'polish' }),
      response_format: 'url',
      size: '1024x1024',
      stream: false,
    })
    expect(downloadImage).toHaveBeenCalledWith('https://example.com/seedream')
    expect(uploadFile).toHaveBeenCalledWith({
      cloudPath: 'room-storage/saier/room/activities/1/session/ai-remix/request.jpg',
      fileContent: Buffer.from('generated'),
    })
  })

  it.each([
    { adapter: 'unknown' },
    { adapter: 'seedream', model: 'doubao-seedream-5-0-flash-260915' },
    { adapter: 'seedream', provider: 'custom-ark-image' },
    { adapter: 'seedream', model: 'model', provider: '../another-provider' },
    { adapter: 'seedream', model: 'model', provider: 'hunyuan-image' },
    { provider: 'custom-ark-image' },
  ])('rejects incomplete or incompatible image configuration before calling a model: %j', async (config) => {
    const createImageModel = vi.fn()
    const generator = aiRemix.createCloudbasePictionaryAiGenerator({
      ...config,
      app: { ai: () => ({ createImageModel }) },
    })

    await expect(generator.generate({
      effect: 'polish',
      imageBase64: 'aW1hZ2U=',
      imageMimeType: 'image/png',
      storageKey: 'unused.jpg',
    })).rejects.toThrow('AI image configuration')
    expect(createImageModel).not.toHaveBeenCalled()
  })

  it('reserves authority state before generation and sends answers only in answer-aware mode', async () => {
    const submitted: Array<{ input: Record<string, unknown>, system: boolean }> = []
    const generate = vi.fn().mockResolvedValue({ fileId: 'cloud://env/remix.jpg' })
    const session = {
      activityEpoch: 2,
      config: { aiMode: 'remix' },
      phaseEpoch: 4,
      roomId: 'room-1',
      round: { canvasSeq: 0, drawerId: 'drawer', roundId: 'round-1' },
      sessionId: 'session-1',
    }
    const service = aiRemix.createPictionaryAiRemixService({
      commandService: {
        submitCommand: async (input: Record<string, unknown>) => {
          submitted.push({ input, system: false })
          return { canvasSeq: 0, deduped: false }
        },
        submitSystemCommand: async (input: Record<string, unknown>) => {
          submitted.push({ input, system: true })
          return { aiRemixOutcome: 'applied', canvasSeq: 1 }
        },
      },
      enabled: true,
      imageGenerator: { generate },
      isUserAllowed: () => true,
      repo: {
        getActivitySecret: async () => ({ selectedAnswer: 'apple' }),
        getActivitySession: async () => session,
      },
      usageLimiter: { reserve: async () => ({ deduped: false }) },
    })

    const result = await service.request(requestInput(), 'drawer')

    expect(result).toMatchObject({ fileId: 'cloud://env/remix.jpg', outcome: 'applied' })
    expect(submitted.map(item => item.system)).toEqual([false, true])
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ answer: undefined, imageMimeType: 'image/png' }))

    session.config.aiMode = 'answer-aware'
    await service.request({ ...requestInput(), commandId: 'request-2', referenceImageDataUrl: 'data:image/jpeg;base64,aW1hZ2U=' }, 'drawer')
    expect(generate).toHaveBeenLastCalledWith(expect.objectContaining({ answer: 'apple', imageMimeType: 'image/jpeg' }))
  })

  it('keeps the production breaker and allowlist server-side', async () => {
    const base = {
      commandService: {},
      imageGenerator: {},
      repo: {},
    }
    await expect(aiRemix.createPictionaryAiRemixService({
      ...base,
      enabled: false,
      isUserAllowed: () => true,
    }).request(requestInput(), 'drawer')).rejects.toThrow('AI_REMIX_DISABLED')
    await expect(aiRemix.createPictionaryAiRemixService({
      ...base,
      enabled: true,
      isUserAllowed: () => false,
    }).request(requestInput(), 'drawer')).rejects.toThrow('FORBIDDEN')
  })

  it('clears the pending gameplay request when the cost budget rejects generation', async () => {
    const generate = vi.fn()
    const submitSystemCommand = vi.fn().mockResolvedValue({})
    const quotaError = Object.assign(new Error('AI_REMIX_DAILY_LIMIT'), {
      code: 'AI_REMIX_DAILY_LIMIT',
      quotaScope: 'user',
    })
    const session = {
      activityEpoch: 2,
      config: { aiMode: 'remix' },
      phaseEpoch: 4,
      roomId: 'room-1',
      round: { roundId: 'round-1' },
      sessionId: 'session-1',
    }
    const service = aiRemix.createPictionaryAiRemixService({
      commandService: {
        submitCommand: vi.fn().mockResolvedValue({ canvasSeq: 0, deduped: false }),
        submitSystemCommand,
      },
      enabled: true,
      imageGenerator: { generate },
      isUserAllowed: () => true,
      repo: {
        getActivitySecret: vi.fn().mockResolvedValue({ selectedAnswer: 'apple' }),
        getActivitySession: vi.fn().mockResolvedValue(session),
      },
      usageLimiter: { reserve: vi.fn().mockRejectedValue(quotaError) },
    })

    await expect(service.request(requestInput(), 'drawer')).rejects.toThrow('AI_REMIX_DAILY_LIMIT')
    expect(generate).not.toHaveBeenCalled()
    expect(submitSystemCommand).toHaveBeenCalledWith(expect.objectContaining({
      payload: { requestId: 'request-1' },
      type: 'failAiRemix',
    }), 'drawer')
  })
})

function requestInput(): Record<string, unknown> {
  return {
    activityEpoch: 2,
    commandId: 'request-1',
    controllerEpoch: 3,
    effect: 'polish',
    phaseEpoch: 4,
    rect: { height: 256, width: 256, x: 32, y: 32 },
    referenceImageDataUrl: 'data:image/png;base64,aW1hZ2U=',
    roundId: 'round-1',
    sessionId: 'session-1',
  }
}
