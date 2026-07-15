<script lang="ts" setup>
defineProps<{
  active?: boolean
  icon: string
}>()
</script>

<template>
  <button
    class="pp-icon-button h-10 w-10 rounded p-1 outline-none"
    flex justify="center" items-center
    text-xl
    :class="{ 'is-active': active }"
  >
    <div :class="icon" />
    <slot />
  </button>
</template>

<style scoped>
.pp-icon-button {
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  background: var(--saier-color-surface, rgb(255 255 255 / 6%));
  color: var(--saier-color-text, white);
  outline: none;
}

.pp-icon-button:hover,
.pp-icon-button.is-active {
  background: var(--saier-color-surface-hover, rgb(255 255 255 / 10%));
}

.pp-icon-button:focus-visible {
  outline: 2px solid var(--saier-color-focus, rgb(147 197 253 / 72%));
  outline-offset: 1px;
}
</style>
