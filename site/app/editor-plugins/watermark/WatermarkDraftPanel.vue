<script setup lang="ts">
import type { WatermarkDocumentHost } from './useWatermarkDocuments'
import type { WatermarkDraftRecord } from '~/features/watermark/draft'
import { computed, shallowRef } from 'vue'

const props = defineProps<{ host: WatermarkDocumentHost, disabled: boolean }>()
const status = computed(() => props.host.drafts.status(props.host.active.value))
const confirming = shallowRef<string>()
const locked = computed(() => props.disabled || props.host.drafts.busy.value)

function label(record: WatermarkDraftRecord): string {
  const draft = record.current as { name?: unknown, updatedAt?: unknown } | undefined
  const name = typeof draft?.name === 'string' ? draft.name : '损坏的水印草稿'
  const time = typeof draft?.updatedAt === 'number' && Number.isFinite(draft.updatedAt)
    ? new Date(draft.updatedAt).toLocaleString()
    : '时间未知'
  return `${name} · ${time}`
}
async function discard(id: string): Promise<void> {
  await props.host.drafts.discard(id)
  confirming.value = undefined
}
</script>

<template>
  <section class="watermark-drafts" aria-label="水印本地草稿">
    <template v-if="status">
      <p role="status">
        {{ status.status }}
      </p>
      <p v-if="status.error" role="alert">
        {{ status.error }}
      </p>
      <div class="actions">
        <button type="button" :disabled="locked" @click="host.active.value && host.drafts.save(host.active.value, true)">
          {{ status.error ? '重试保存草稿' : '立即保存草稿' }}
        </button>
        <button type="button" :disabled="locked" @click="confirming = status.id">
          丢弃本地草稿
        </button>
      </div>
    </template>
    <template v-if="host.drafts.recoveries.value.length">
      <p>可恢复的水印草稿</p>
      <ul>
        <li v-for="record in host.drafts.recoveries.value" :key="record.id">
          <span>{{ label(record) }}</span>
          <div class="actions">
            <button type="button" :disabled="locked" @click="host.restoreDraft(record)">
              恢复草稿
            </button>
            <button type="button" :disabled="locked" @click="confirming = record.id">
              丢弃草稿
            </button>
          </div>
        </li>
      </ul>
    </template>
    <div v-if="confirming" class="confirm" role="group" aria-label="确认丢弃水印草稿">
      <p>丢弃此作品的本地恢复副本？当前画面仍保留，再次编辑后会重新保存。</p>
      <div class="actions">
        <button type="button" :disabled="locked" @click="discard(confirming)">
          确认丢弃
        </button>
        <button type="button" @click="confirming = undefined">
          取消
        </button>
      </div>
    </div>
    <template v-if="host.drafts.error.value">
      <p role="alert">
        {{ host.drafts.error.value }}
      </p>
      <button type="button" :disabled="locked" @click="host.drafts.load()">
        重新读取草稿
      </button>
    </template>
    <p class="editor-hint">
      仅在此浏览器保留。请等到显示「已保存到本机」再刷新；长期备份请下载工作文件。
    </p>
  </section>
</template>

<style scoped>
.watermark-drafts {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--saier-color-border);
}
p,
ul {
  margin: 0;
}
ul {
  display: grid;
  gap: 12px;
  padding: 0;
  list-style: none;
}
li,
.confirm {
  display: grid;
  gap: 6px;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
[role='alert'] {
  color: var(--saier-color-danger);
}
</style>
