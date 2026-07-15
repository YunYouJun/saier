<script setup lang="ts">
import { validateCustomWordBank } from '@saier/collaboration'
import { computed, onBeforeUnmount, shallowRef } from 'vue'
import { useRouter } from '#imports'
import { SiteActivityPageHeader, SiteActivityPanel } from '~/components/activity'
import { useYunlefunRoomActivities } from '~/composables/useYunlefunRoomActivities'
import { createSiteActivityLocation, parsePictionaryJoinTarget } from '~/utils/activityPluginRoutes'
import PictionaryCreateRoomCard from './PictionaryCreateRoomCard.vue'
import PictionaryJoinRoomCard from './PictionaryJoinRoomCard.vue'
import { usePictionaryI18n } from './i18n'

const router = useRouter()
const activities = useYunlefunRoomActivities()
const { text } = usePictionaryI18n()
const title = shallowRef(text.value.lobby.defaultRoomName)
const customWords = shallowRef('')
const joinTarget = shallowRef('')
const createError = shallowRef('')
const joinError = shallowRef('')
let disposed = false

const parsedWords = computed(() => customWords.value
  .split(/[\n,，]/u)
  .map(word => word.trim())
  .filter(Boolean))

async function createGame(): Promise<void> {
  createError.value = ''
  try {
    const words = parsedWords.value.length > 0 ? validateCustomWordBank(parsedWords.value) : undefined
    const created = await activities.createRoom(title.value)
    if (abortDisposedWork())
      return
    await activities.activatePictionary({
      commandId: crypto.randomUUID(),
      config: { customBank: Boolean(words) },
      roomId: created.session.room.id,
      words,
    })
    if (abortDisposedWork())
      return
    await router.push(createSiteActivityLocation({
      inviteToken: created.inviteToken,
      roomId: created.session.room.id,
      type: 'pictionary',
    }))
  }
  catch (error) {
    if (disposed) {
      activities.dispose()
      return
    }
    if (error instanceof RangeError || error instanceof TypeError)
      createError.value = text.value.errors.invalidWordBank
    else
      createError.value = error instanceof Error ? error.message : text.value.errors.createFailed
  }
}

function abortDisposedWork(): boolean {
  if (!disposed)
    return false
  activities.dispose()
  return true
}

onBeforeUnmount(() => {
  disposed = true
  activities.dispose()
})

async function joinGame(): Promise<void> {
  joinError.value = ''
  const value = joinTarget.value.trim()
  if (!value)
    return
  const request = parsePictionaryJoinTarget(value, window.location.origin)
  if (!request) {
    joinError.value = text.value.errors.invalidJoinTarget
    return
  }
  try {
    await router.push(createSiteActivityLocation(request))
  }
  catch (error) {
    joinError.value = error instanceof Error ? error.message : text.value.errors.joinFailed
  }
}
</script>

<template>
  <main class="pictionary-home site-activity-surface">
    <div class="pictionary-home__content site-activity-container">
      <SiteActivityPageHeader
        :description="text.lobby.description"
        icon="i-ph-game-controller"
        kicker="Saier Activity"
        :title="text.lobby.title"
      />

      <section v-if="activities.features.pictionary" class="pictionary-home__grid">
        <PictionaryCreateRoomCard
          v-model:custom-words="customWords"
          v-model:title="title"
          :busy="activities.busy.value"
          :error="createError || activities.lastError.value"
          @submit="createGame"
        />
        <PictionaryJoinRoomCard
          v-model="joinTarget"
          :error="joinError"
          @submit="joinGame"
        />
      </section>

      <SiteActivityPanel v-else class="pictionary-home__disabled">
        <span class="pictionary-home__disabled-icon i-ph-game-controller" aria-hidden="true" />
        <h2>{{ text.lobby.disabledTitle }}</h2>
        <p>{{ text.lobby.disabledDescription }}</p>
      </SiteActivityPanel>
    </div>
  </main>
</template>

<style scoped>
.pictionary-home {
  padding-block: 24px 32px;
}

.pictionary-home__content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pictionary-home__disabled h2,
.pictionary-home__disabled p {
  margin: 0;
}

.pictionary-home__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(300px, 0.92fr);
  gap: 12px;
}

.pictionary-home__disabled {
  display: grid;
  max-width: 520px;
  place-items: center;
  gap: 8px;
  padding: 32px;
  text-align: center;
}

.pictionary-home__disabled-icon {
  color: var(--saier-color-text-subtle);
  font-size: 32px;
}

.pictionary-home__disabled h2 {
  font-size: 16px;
}

.pictionary-home__disabled p {
  color: var(--saier-color-text-muted);
  font-size: 12px;
}

@media (max-width: 760px) {
  .pictionary-home {
    padding-block: 16px 24px;
  }

  .pictionary-home__grid {
    grid-template-columns: 1fr;
  }
}
</style>
