<script lang="ts" setup>
defineProps<{
  active?: boolean
  icon: string
}>()
</script>

<template>
  <button
    class="pp-icon-button h-10 w-10 rounded bg-dark-200 p-1 outline-none"
    flex justify="center" items-center
    text-xl text-white
    :class="{
      'bg-dark-400': active,
      'hover:bg-dark-400': !active,
    }"
  >
    <div :class="icon" />
    <slot />
  </button>
</template>

<style lang="scss">
.pp-icon-button {
  outline: none;

  &:focus {
    outline: none;
  }
}
</style>
