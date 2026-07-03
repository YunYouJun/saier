<script setup lang="ts">
import type { SiteKeyboardShortcutRow } from '~/types/painter-app'
import { computed, shallowRef, watch } from 'vue'

interface SiteKeyboardShortcutsDialogLabels {
  title: string
  search: string
  searchPlaceholder: string
  resetDefaults: string
  close: string
  category: string
  command: string
  shortcut: string
  noResults: string
}

const props = defineProps<{
  labels: SiteKeyboardShortcutsDialogLabels
  open: boolean
  rows: readonly SiteKeyboardShortcutRow[]
}>()

const emit = defineEmits<{
  close: []
  resetDefaults: []
}>()

const query = shallowRef('')

const visibleRows = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  if (!normalizedQuery)
    return props.rows

  return props.rows.filter(row =>
    row.label.toLowerCase().includes(normalizedQuery)
    || row.categoryLabel.toLowerCase().includes(normalizedQuery)
    || row.shortcutLabel.toLowerCase().includes(normalizedQuery),
  )
})

watch(
  () => props.open,
  (open) => {
    if (open)
      query.value = ''
  },
)
</script>

<template>
  <div
    v-if="open"
    class="site-shortcuts"
    role="dialog"
    aria-modal="true"
    :aria-label="labels.title"
    @keydown.esc.stop="emit('close')"
  >
    <section class="site-shortcuts__panel">
      <header class="site-shortcuts__header">
        <h2 class="site-shortcuts__title">
          {{ labels.title }}
        </h2>
        <button type="button" class="site-shortcuts__icon" :title="labels.close" @click="emit('close')">
          <span class="i-ph-x" />
        </button>
      </header>

      <div class="site-shortcuts__toolbar">
        <label class="site-shortcuts__search">
          <span class="site-shortcuts__search-label">{{ labels.search }}</span>
          <span class="site-shortcuts__search-box">
            <span class="i-ph-magnifying-glass" />
            <input
              v-model="query"
              class="site-shortcuts__input"
              type="search"
              :placeholder="labels.searchPlaceholder"
              autocomplete="off"
            >
          </span>
        </label>
        <button type="button" class="site-shortcuts__button" @click="emit('resetDefaults')">
          <span class="i-ph-arrow-counter-clockwise" />
          <span>{{ labels.resetDefaults }}</span>
        </button>
      </div>

      <div class="site-shortcuts__table" role="table">
        <div class="site-shortcuts__row site-shortcuts__row--head" role="row">
          <span role="columnheader">{{ labels.category }}</span>
          <span role="columnheader">{{ labels.command }}</span>
          <span role="columnheader">{{ labels.shortcut }}</span>
        </div>
        <div v-if="visibleRows.length === 0" class="site-shortcuts__empty">
          {{ labels.noResults }}
        </div>
        <div
          v-for="row in visibleRows"
          :key="row.id"
          class="site-shortcuts__row"
          role="row"
        >
          <span class="site-shortcuts__category" role="cell">{{ row.categoryLabel }}</span>
          <span class="site-shortcuts__command" role="cell">{{ row.label }}</span>
          <kbd class="site-shortcuts__key" role="cell">{{ row.shortcutLabel }}</kbd>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.site-shortcuts {
  box-sizing: border-box;
  position: absolute;
  z-index: 45;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 14px;
  background: rgb(0 0 0 / 42%);
}

.site-shortcuts__panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(720px, calc(100vw - 28px));
  max-height: min(720px, calc(100vh - 28px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 8px;
  background: rgb(20 20 22 / 96%);
  box-shadow: 0 24px 70px rgb(0 0 0 / 42%);
  color: white;
  padding: 12px;
}

.site-shortcuts__header,
.site-shortcuts__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.site-shortcuts__header {
  justify-content: space-between;
  margin-bottom: 12px;
}

.site-shortcuts__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.site-shortcuts__icon,
.site-shortcuts__button {
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(255 255 255 / 7%);
  color: white;
}

.site-shortcuts__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
}

.site-shortcuts__toolbar {
  min-width: 0;
  justify-content: space-between;
  margin-bottom: 12px;
}

.site-shortcuts__search {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 5px;
  color: rgb(255 255 255 / 60%);
  font-size: 12px;
}

.site-shortcuts__search-box {
  display: flex;
  min-width: 0;
  height: 34px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 52%);
  padding: 0 9px;
}

.site-shortcuts__input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: white;
  font-size: 13px;
  outline: none;
}

.site-shortcuts__input::placeholder {
  color: rgb(255 255 255 / 34%);
}

.site-shortcuts__search-box:focus-within {
  border-color: rgb(96 165 250 / 70%);
  box-shadow: 0 0 0 2px rgb(96 165 250 / 16%);
}

.site-shortcuts__button {
  display: inline-flex;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  padding: 0 10px;
}

.site-shortcuts__table {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
}

.site-shortcuts__row {
  display: grid;
  grid-template-columns: minmax(92px, 0.8fr) minmax(160px, 1.4fr) minmax(96px, 0.9fr);
  min-height: 34px;
  align-items: center;
  gap: 12px;
  border-top: 1px solid rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 76%);
  font-size: 13px;
  padding: 7px 10px;
}

.site-shortcuts__row:first-child {
  border-top: 0;
}

.site-shortcuts__row--head {
  position: sticky;
  z-index: 1;
  top: 0;
  min-height: 30px;
  background: rgb(28 28 31 / 98%);
  color: rgb(255 255 255 / 46%);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.site-shortcuts__category,
.site-shortcuts__command {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-shortcuts__command {
  color: rgb(255 255 255 / 88%);
}

.site-shortcuts__key {
  justify-self: start;
  min-width: 0;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 82%);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 5px 7px;
}

.site-shortcuts__empty {
  padding: 18px 10px;
  color: rgb(255 255 255 / 48%);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 640px) {
  .site-shortcuts__toolbar {
    display: grid;
  }

  .site-shortcuts__button {
    justify-content: center;
  }

  .site-shortcuts__row {
    grid-template-columns: minmax(72px, 0.7fr) minmax(120px, 1.1fr) minmax(72px, 0.8fr);
    gap: 8px;
    padding-inline: 8px;
  }
}
</style>
