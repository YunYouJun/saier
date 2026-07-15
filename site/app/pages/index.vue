<script setup lang="ts">
import type { SiteActivityQueryValue } from '~/utils/activityPluginRoutes'
import { computed } from 'vue'
import { useRoute } from '#imports'
import SitePainterApplication from '~/components/SitePainterApplication.vue'
import { parseSiteActivityPluginQuery } from '~/utils/activityPluginRoutes'

const route = useRoute()
const activityRequest = computed(() => parseSiteActivityPluginQuery(
  route.query as Record<string, SiteActivityQueryValue>,
))
</script>

<template>
  <SitePainterApplication :activity-request="activityRequest" />
</template>
