import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const aiRemix = require('../cloudbase/functions/saier-room-api/pictionary-ai-remix.cjs') as {
  buildAiRemixPrompt: (input: { answer?: string, effect: string }) => string
  createCloudbasePictionaryAiGenerator: (options: Record<string, unknown>) => {
    generate: (input: Record<string, unknown>) => Promise<{ fileId: string }>
  }
  createPictionaryAiRemixService: (options: Record<string, unknown>) => {
    request: (input: Record<string, unknown>, userId: string) => Promise<Record<string, unknown>>
  }
}

describe('pictionary AI remix boundary', () => {
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
          return { canvasSeq: 1 }
        },
      },
      enabled: true,
      imageGenerator: { generate },
      isUserAllowed: () => true,
      repo: {
        getActivitySecret: async () => ({ selectedAnswer: 'apple' }),
        getActivitySession: async () => session,
      },
    })

    const result = await service.request(requestInput(), 'drawer')

    expect(result).toMatchObject({ fileId: 'cloud://env/remix.jpg', outcome: 'applied' })
    expect(submitted.map(item => item.system)).toEqual([false, true])
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ answer: undefined }))

    session.config.aiMode = 'answer-aware'
    await service.request({ ...requestInput(), commandId: 'request-2' }, 'drawer')
    expect(generate).toHaveBeenLastCalledWith(expect.objectContaining({ answer: 'apple' }))
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
