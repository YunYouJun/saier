<script setup lang="ts">
import { useSiteTheme } from '~/composables/useSiteTheme'
import { appName } from '~/constants'

const { resolvedTheme } = useSiteTheme()

useHead(() => ({
  htmlAttrs: {
    'data-saier-theme': resolvedTheme.value,
    'data-ylf-editor-theme': resolvedTheme.value,
  },
  meta: [
    {
      name: 'theme-color',
      content: resolvedTheme.value === 'dark' ? '#242426' : '#f6f6f7',
    },
  ],
  title: appName,
}))
</script>

<template>
  <VitePwaManifest />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
html,
body,
#__nuxt {
  position: relative;
  height: 100vh;
  margin: 0;
  padding: 0;
}
</style>
