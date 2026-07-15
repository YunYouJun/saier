<script setup lang="ts">
import { useRouter } from '#imports'
import { createSiteActivityLocation } from '~/utils/activityPluginRoutes'
import PictionaryActivityLobby from './PictionaryActivityLobby.vue'
import PictionaryActivityRoom from './PictionaryActivityRoom.vue'

const props = defineProps<{
  inviteToken?: string
  roomId?: string
}>()

const emit = defineEmits<{
  exit: []
}>()

const router = useRouter()

async function openLobby(): Promise<void> {
  await router.replace(createSiteActivityLocation({ type: 'pictionary' }))
}
</script>

<template>
  <PictionaryActivityRoom
    v-if="props.roomId"
    :room-id="props.roomId"
    :invite-token="props.inviteToken"
    @exit="emit('exit')"
    @open-lobby="openLobby"
  />
  <PictionaryActivityLobby v-else @exit="emit('exit')" />
</template>
