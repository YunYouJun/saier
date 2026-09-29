<script setup lang="ts">
import type { LoadedPreset } from '~/features/watermark/preset'
import type { PresetAssetDescriptor } from '~/features/watermark/preset-contract'
import PainterFileInput from '@saier/vue/components/PainterFileInput.vue'
import { computed, ref, watch } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useYunlefunAuth } from '~/composables/useYunlefunAuth'
import { WATERMARK_IMAGE_TYPES } from '~/features/watermark/custom-asset'
import { WATERMARK_ROLE_NAMES } from '~/features/watermark/editing'
import { usePrivateWatermarks } from '~/features/watermark/usePrivateWatermarks'

const props = defineProps<{ preset?: LoadedPreset, disabled?: boolean }>()
const emit = defineEmits<{ import: [file: File, role: PresetAssetDescriptor['role'], recolorable: boolean] }>()
const auth = useYunlefunAuth()
const config = useRuntimeConfig()
const cloudEnabled = computed(() => config.public.saierPrivateAssetsEnabled === true || String(config.public.saierPrivateAssetsEnabled) === 'true')
const owner = computed(() => auth.account.value?.uid)
const library = usePrivateWatermarks({
  userId: owner,
  ensureSession: auth.getRuntimeAccessToken,
  async invoke(data) {
    const app = await auth.getCloudbaseApp()
    if (!app?.callFunction)
      throw new Error('当前环境不支持私有素材库')
    return (await app.callFunction({ name: String(config.public.saierAssetsApiFunctionName), data })).result
  },
})
const { items, nextCursor, loaded, busy, error, status, pendingUpload } = library
const role = ref<PresetAssetDescriptor['role']>('small-seal')
const recolorable = ref(true)
const selected = ref('')
const query = ref('')
const locked = computed(() => props.disabled || busy.value)
watch(() => props.preset, (preset) => {
  if (!preset?.assets.some(asset => asset.id === selected.value))
    selected.value = preset?.assets[0]?.id ?? ''
}, { immediate: true })
watch(owner, () => {
  query.value = ''
})
function useFile(file: File): void {
  emit('import', file, role.value, recolorable.value)
}
async function choose(assetId: string): Promise<void> {
  const user = owner.value
  const file = await library.download(assetId)
  if (file && owner.value === user && !props.disabled)
    useFile(file)
}
async function uploadSelected(): Promise<void> {
  const asset = props.preset?.assets.find(asset => asset.id === selected.value)
  if (!asset || locked.value || pendingUpload.value)
    return
  const user = owner.value
  const blob = await new Promise<Blob | null>(resolve => asset.image.toBlob(resolve, 'image/png'))
  if (blob && owner.value === user && !locked.value)
    await library.upload(new File([blob], `${(asset.name || WATERMARK_ROLE_NAMES[asset.role]).replace(/\.[^.]+$/, '')}.png`, { type: 'image/png' }))
}
</script>

<template>
  <section class="watermark-library" aria-label="自定义水印与私有素材">
    <div class="library-title">
      <span class="i-ph-images" aria-hidden="true" />我的水印
    </div>
    <label class="library-field">素材用途
      <select v-model="role" :disabled="locked" aria-label="自定义水印用途">
        <option v-for="(name, value) in WATERMARK_ROLE_NAMES" :key="value" :value="value">{{ name }}</option>
      </select>
    </label>
    <label class="recolor"><input v-model="recolorable" type="checkbox" :disabled="locked">允许随画面调整颜色</label>
    <PainterFileInput label="添加自定义水印" accept="image/png,image/jpeg,image/webp" :disabled="locked" @pick="useFile" />
    <p class="editor-hint">
      PNG · JPEG · WebP，单张 25 MB。添加后仅保存在当前工作文件中。
    </p>
    <details class="cloud-library">
      <summary><span class="i-ph-lock-simple" aria-hidden="true" />Drive 私有素材库</summary>
      <p class="editor-hint">
        与云乐坊 Drive 共用账号和存储空间。上传图片素材；布局与混合效果保留在 Saier 预设中。
      </p>
      <p v-if="!cloudEnabled" class="editor-hint" role="status">
        云端同步尚未开通，本地素材可继续使用。
      </p>
      <button v-else-if="!owner" type="button" :disabled="locked || ['checking', 'signing-in'].includes(auth.status.value)" @click="auth.signIn('interactive')">
        登录云乐坊
      </button>
      <template v-else>
        <p class="owner">
          {{ auth.displayName.value }} · 仅自己可见
        </p>
        <div v-if="preset?.assets.length" class="upload-row">
          <select v-model="selected" :disabled="locked || !!pendingUpload" aria-label="待上传水印素材">
            <option v-for="(asset, index) in preset.assets" :key="asset.id" :value="asset.id">
              {{ index + 1 }} · {{ asset.name || WATERMARK_ROLE_NAMES[asset.role] }}
            </option>
          </select>
          <button type="button" :disabled="locked || !selected || !!pendingUpload" @click="uploadSelected">
            上传到 Drive
          </button>
        </div>
        <button v-if="pendingUpload" type="button" :disabled="locked" @click="library.retryComplete">
          重试确认上传
        </button>
        <div class="search-row">
          <input v-model="query" type="search" aria-label="搜索私有素材" placeholder="搜索 Drive 素材" maxlength="120" :disabled="locked" @keydown.enter.prevent="library.refresh(query)">
          <button type="button" :disabled="locked" @click="library.refresh(query)">
            {{ loaded ? '刷新' : '读取' }}
          </button>
        </div>
        <ul v-if="items.length" aria-label="我的 Drive 素材">
          <li v-for="item in items" :key="item.assetId">
            <span class="asset-info"><span :title="item.name">{{ item.name }}</span><small>{{ item.width }} × {{ item.height }}</small></span>
            <button type="button" :disabled="locked || !WATERMARK_IMAGE_TYPES.includes(item.mimeType)" @click="choose(item.assetId)">
              选用
            </button>
          </li>
        </ul>
        <p v-else-if="loaded && !busy" class="editor-hint">
          {{ nextCursor ? '本页暂无可用素材，可继续加载。' : '暂无匹配素材，可上传当前水印。' }}
        </p>
        <button v-if="nextCursor" type="button" :disabled="locked" @click="library.refresh(query, true)">
          加载更多
        </button>
      </template>
      <p v-if="busy" role="status">
        正在连接私有素材库…
      </p>
      <p v-if="status" role="status">
        {{ status }}
      </p>
      <p v-if="error || auth.errorMessage.value" role="alert">
        {{ error || auth.errorMessage.value }}
      </p>
    </details>
  </section>
</template>

<style scoped>
.watermark-library {
  display: grid;
  gap: var(--saier-space-2);
  min-width: 0;
  padding-block: var(--saier-space-2);
  border-block: 1px solid var(--saier-color-border);
}
.library-title,
summary {
  display: flex;
  align-items: center;
  gap: var(--saier-space-1);
  font-weight: 600;
}
.library-field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--saier-space-2);
}
.recolor {
  display: flex;
  gap: var(--saier-space-1);
  align-items: center;
}
.cloud-library {
  display: block;
  min-width: 0;
}
.cloud-library > :not(summary) {
  margin-top: var(--saier-space-2);
}
summary {
  cursor: pointer;
  min-height: var(--saier-control-size);
}
.upload-row,
.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--saier-space-1);
}
.owner {
  color: var(--saier-color-text-muted);
}
ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
li {
  display: flex;
  align-items: center;
  gap: var(--saier-space-2);
  padding-block: var(--saier-space-1);
  border-bottom: 1px solid var(--saier-color-border);
}
.asset-info {
  flex: 1;
  min-width: 0;
  display: grid;
}
.asset-info > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
small {
  color: var(--saier-color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
