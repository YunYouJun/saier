<script setup lang="ts">
import type { SiteActivityQueryValue } from '~/utils/activityPluginRoutes'
import { computed } from 'vue'
import { useRoute, useRouter } from '#imports'
import SiteActivityPluginHost from '~/components/SiteActivityPluginHost.vue'
import SitePainterApplication from '~/components/SitePainterApplication.vue'
import { parseSiteActivityPluginQuery } from '~/utils/activityPluginRoutes'

const route = useRoute()
const router = useRouter()
const activityRequest = computed(() => parseSiteActivityPluginQuery(
  route.query as Record<string, SiteActivityQueryValue>,
))

async function exitActivity(): Promise<void> {
  await router.replace({ path: '/' })
}
</script>

<template>
  <SiteActivityPluginHost
    v-if="activityRequest"
    :key="`${activityRequest.type}:${activityRequest.roomId ?? 'lobby'}`"
    :request="activityRequest"
    @exit="exitActivity"
  />
  <SitePainterApplication v-else />
</template>
