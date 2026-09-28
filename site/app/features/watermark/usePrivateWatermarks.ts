import type { Asset } from '@yunlefun/assets'
import type { Ref } from 'vue'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { createPrivateAssetClient } from './private-assets'

export interface PrivateWatermarkSession {
  userId: Readonly<Ref<string | undefined>>
  ensureSession: () => Promise<unknown>
  invoke: (data: Record<string, unknown>) => Promise<unknown>
}

/** No persistent cloud cache: lists, transfer capabilities and retries belong to one session. */
export function usePrivateWatermarks(session: PrivateWatermarkSession) {
  const items = shallowRef<Asset[]>([])
  const nextCursor = ref<string | null>(null)
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref('')
  const status = ref('')
  const pendingUpload = ref('')
  let active: AbortController | undefined
  let revision = 0
  let search = ''

  function reset(): void {
    revision++
    active?.abort()
    active = undefined
    items.value = []
    nextCursor.value = null
    loaded.value = false
    pendingUpload.value = ''
    busy.value = false
    error.value = ''
    status.value = ''
    search = ''
  }
  watch(session.userId, reset, { flush: 'sync' })
  onScopeDispose(reset)

  async function run<T>(operation: (client: ReturnType<typeof createPrivateAssetClient>, assertCurrent: () => void) => Promise<T>): Promise<T | undefined> {
    if (busy.value)
      return
    const owner = session.userId.value
    if (!owner) {
      error.value = '请先登录云乐坊账号'
      return
    }
    const version = revision
    const controller = new AbortController()
    active = controller
    busy.value = true
    error.value = ''
    status.value = ''
    function assertCurrent(): void {
      controller.signal.throwIfAborted()
      if (version !== revision || session.userId.value !== owner)
        throw new Error('账号已切换，请重新操作')
    }
    const client = createPrivateAssetClient({
      async assertSession() {
        assertCurrent()
        await session.ensureSession()
        assertCurrent()
      },
      async invoke(data) {
        assertCurrent()
        try {
          return await session.invoke({ ...data, expectedUserId: owner })
        }
        catch {
          // SDK errors may contain request headers. Never put them in the UI.
          throw new Error('Drive 私有素材服务暂时不可用，请稍后重试')
        }
      },
    }, controller.signal)
    try {
      const result = await operation(client, assertCurrent)
      assertCurrent()
      return result
    }
    catch (reason) {
      if (!controller.signal.aborted && version === revision)
        error.value = reason instanceof Error ? reason.message : 'Drive 素材操作失败'
    }
    finally {
      if (active === controller) {
        active = undefined
        busy.value = false
      }
    }
  }

  async function refresh(query = '', more = false): Promise<void> {
    if (more && !nextCursor.value)
      return
    await run(async (client, check) => {
      const page = await client.list(more ? nextCursor.value! : undefined, more ? search : query.trim())
      check()
      const previous = more ? items.value : []
      items.value = [...new Map([...previous, ...page.items].map(item => [item.assetId, item])).values()]
      nextCursor.value = page.nextCursor
      search = more ? search : query.trim()
      loaded.value = true
    })
  }
  function uploaded(asset: Asset): void {
    pendingUpload.value = ''
    status.value = asset.status === 'ready' ? '已存入当前账号的 Drive 私有素材库' : '已上传，Drive 正在处理，稍后刷新即可选用'
    if (asset.status === 'ready')
      items.value = [asset, ...items.value.filter(item => item.assetId !== asset.assetId)]
  }
  async function upload(file: File): Promise<void> {
    await run(async (client, check) => {
      const asset = await client.upload(file, (id) => {
        check()
        pendingUpload.value = id
      })
      check()
      uploaded(asset)
    })
  }
  async function retryComplete(): Promise<void> {
    if (!pendingUpload.value)
      return
    await run(async (client, check) => {
      const asset = await client.complete(pendingUpload.value)
      check()
      uploaded(asset)
    })
  }
  async function download(assetId: string): Promise<File | undefined> {
    return run(client => client.download(assetId))
  }
  return { items, nextCursor, loaded, busy, error, status, pendingUpload, refresh, upload, retryComplete, download }
}
