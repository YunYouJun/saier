<script setup lang="ts">
const logoSrc = '/logo.svg'
</script>

<template>
  <img class="saier-logo" :src="logoSrc" alt="" width="32" height="32" draggable="false">
</template>

<style scoped>
.saier-logo {
  display: block;
  flex-shrink: 0;
  object-fit: contain;
}
</style>
