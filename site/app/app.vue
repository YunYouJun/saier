<script setup lang="ts">
import { useSiteTheme } from '~/composables/useSiteTheme'
import { appName } from '~/constants'

const { resolvedTheme } = useSiteTheme()

useHead(() => ({
  htmlAttrs: {
    'data-saier-theme': resolvedTheme.value,
  },
  meta: [
    {
      name: 'theme-color',
      content: resolvedTheme.value === 'dark' ? '#202124' : '#e4e6e9',
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
