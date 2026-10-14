<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { appIcon } from '../constants/brand'

withDefaults(defineProps<{ size?: number }>(), { size: 32 })

const failed = shallowRef(false)
const logoSrc = computed(() => failed.value ? appIcon.legacySrc : appIcon.src)

function onImageError() {
  failed.value = true
}
</script>

<template>
  <img
    class="saier-logo"
    :src="logoSrc"
    alt=""
    :width="size"
    :height="size"
    draggable="false"
    decoding="async"
    referrerpolicy="no-referrer"
    @error="onImageError"
  >
</template>

<style scoped>
.saier-logo {
  display: block;
  flex-shrink: 0;
  border-radius: 21.5%;
  object-fit: contain;
}
</style>
