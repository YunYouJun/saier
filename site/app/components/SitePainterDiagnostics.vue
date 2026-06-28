<script setup lang="ts">
import type { MemoryEstimateEntry, PainterMemorySnapshot } from '@saier/core'
import { computed } from 'vue'

interface SitePainterDiagnosticsLabels {
  browser: string
  diagnostics: string
  estimated: string
  unavailable: string
  surface: string
  total: string
  undo: string
  risk: Record<PainterMemorySnapshot['riskLevel'], string>
}

const props = defineProps<{
  memory?: PainterMemorySnapshot
  labels: SitePainterDiagnosticsLabels
}>()

const totalLabel = computed(() => props.memory
  ? formatBytes(props.memory.totalEstimatedBytes)
  : props.labels.unavailable)

const browserLabel = computed(() => props.memory?.browser
  ? formatBytes(props.memory.browser.bytes)
  : props.labels.unavailable)

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`

  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let unit = units[0]!

  for (let index = 1; index < units.length && value >= 1024; index++) {
    value /= 1024
    unit = units[index]!
  }

  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

function entryLabel(entry: MemoryEstimateEntry): string {
  const count = entry.count === undefined ? '' : ` x${entry.count}`
  return `${entry.label}${count}`
}
</script>

<template>
  <section v-if="memory" class="site-diagnostics" aria-live="polite">
    <header class="site-diagnostics__header">
      <span>{{ labels.diagnostics }}</span>
      <strong>{{ labels.risk[memory.riskLevel] }}</strong>
    </header>

    <dl class="site-diagnostics__summary">
      <div>
        <dt>{{ labels.total }}</dt>
        <dd>~{{ totalLabel }}</dd>
      </div>
      <div>
        <dt>{{ labels.browser }}</dt>
        <dd>{{ browserLabel }}</dd>
      </div>
    </dl>

    <div class="site-diagnostics__section">
      <h2>{{ labels.surface }} · ~{{ formatBytes(memory.surface.totalEstimatedBytes) }}</h2>
      <p v-for="entry in memory.surface.entries" :key="entry.id">
        <span>{{ entryLabel(entry) }}</span>
        <strong>~{{ formatBytes(entry.bytes) }}</strong>
      </p>
    </div>

    <div class="site-diagnostics__section">
      <h2>{{ labels.undo }} · ~{{ formatBytes(memory.undo.totalEstimatedBytes) }}</h2>
      <p v-for="entry in memory.undo.entries" :key="entry.id">
        <span>{{ entryLabel(entry) }}</span>
        <strong>~{{ formatBytes(entry.bytes) }}</strong>
      </p>
    </div>
  </section>
</template>

<style scoped>
.site-diagnostics {
  width: min(300px, calc(100vw - 24px));
  padding: 10px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  background: rgb(18 18 20 / 90%);
  box-shadow: 0 18px 50px rgb(0 0 0 / 28%);
  color: white;
  font-size: 12px;
}

.site-diagnostics__header,
.site-diagnostics__summary div,
.site-diagnostics__section p {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.site-diagnostics__header {
  padding-bottom: 8px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  font-weight: 650;
}

.site-diagnostics__header strong {
  color: #facc15;
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
}

.site-diagnostics__summary {
  display: grid;
  gap: 5px;
  margin: 8px 0;
}

.site-diagnostics__summary dt,
.site-diagnostics__section span {
  overflow: hidden;
  min-width: 0;
  color: rgb(255 255 255 / 56%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-diagnostics__summary dd,
.site-diagnostics__section strong {
  margin: 0;
  color: rgb(255 255 255 / 82%);
  font-variant-numeric: tabular-nums;
  font-weight: 560;
  white-space: nowrap;
}

.site-diagnostics__section {
  display: grid;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid rgb(255 255 255 / 8%);
}

.site-diagnostics__section h2 {
  margin: 0;
  color: rgb(255 255 255 / 78%);
  font-size: 12px;
  font-weight: 650;
}

.site-diagnostics__section p {
  margin: 0;
}
</style>
