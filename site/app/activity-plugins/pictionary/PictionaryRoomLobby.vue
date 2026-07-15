<script setup lang="ts">
import type { PictionaryPlayer } from '@saier/collaboration'
import { computed } from 'vue'
import { SiteActivityButton, SiteActivityField, SiteActivityPageHeader, SiteActivityPanel } from '~/components/activity'
import { formatPictionaryMessage, usePictionaryI18n } from './i18n'

const props = defineProps<{
  busy: boolean
  hostId: string
  isHost: boolean
  players: readonly PictionaryPlayer[]
}>()

const emit = defineEmits<{
  invite: []
  settingsChange: []
  start: []
}>()

const cycles = defineModel<1 | 2 | 3 | 4 | 5>('cycles', { required: true })
const duration = defineModel<60_000 | 90_000 | 120_000>('duration', { required: true })
const { text } = usePictionaryI18n()
const activePlayerCount = computed(() => props.players.filter(player => player.status === 'active').length)
const lobbyDescription = computed(() => formatPictionaryMessage(text.value.room.lobbyDescription, {
  count: props.players.length,
}))
const playerCountLabel = computed(() => formatPictionaryMessage(text.value.room.playerCount, {
  count: props.players.length,
}))
const durationOptions = computed(() => ([60, 90, 120] as const).map(seconds => ({
  label: formatPictionaryMessage(text.value.room.seconds, { count: seconds }),
  value: seconds * 1000 as 60_000 | 90_000 | 120_000,
})))
const waitingLabel = computed(() => formatPictionaryMessage(text.value.room.waitingHost, {
  host: props.hostId,
}))
</script>

<template>
  <section class="pictionary-room-lobby site-activity-container">
    <SiteActivityPageHeader
      class="pictionary-room-lobby__intro"
      :description="lobbyDescription"
      :kicker="text.room.lobbyKicker"
      :title="text.lobby.title"
    >
      <template #actions>
        <SiteActivityButton variant="primary" @click="emit('invite')">
          <span class="i-ph-link" aria-hidden="true" />
          {{ text.room.copyInvite }}
        </SiteActivityButton>
      </template>
    </SiteActivityPageHeader>

    <SiteActivityPanel
      class="pictionary-room-lobby__panel"
      :description="playerCountLabel"
      icon="i-ph-users-three"
      :title="text.room.players"
    >
      <ul class="pictionary-player-list">
        <li v-for="player in players" :key="player.userId">
          <span class="pictionary-player-avatar">{{ player.userId.slice(0, 2).toUpperCase() }}</span>
          <span class="pictionary-player-copy">
            <strong>{{ player.userId }}</strong>
            <small>{{ text.playerStatus[player.status] }}</small>
          </span>
          <span v-if="player.userId === hostId" class="pictionary-host-badge">{{ text.room.host }}</span>
          <span class="pictionary-online-dot" :class="{ 'is-offline': !player.online }" />
        </li>
      </ul>

      <div v-if="isHost" class="pictionary-lobby-settings">
        <SiteActivityField :label="text.room.cycles">
          <select v-model.number="cycles" class="site-activity-control" :disabled="busy" @change="emit('settingsChange')">
            <option v-for="value in [1, 2, 3, 4, 5]" :key="value" :value="value">
              {{ value }}
            </option>
          </select>
        </SiteActivityField>
        <SiteActivityField :label="text.room.perRound">
          <select v-model.number="duration" class="site-activity-control" :disabled="busy" @change="emit('settingsChange')">
            <option v-for="option in durationOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </SiteActivityField>
        <SiteActivityButton
          class="pictionary-lobby-settings__start"
          :disabled="busy || activePlayerCount < 2"
          variant="primary"
          @click="emit('start')"
        >
          <span class="i-ph-play" aria-hidden="true" />
          {{ text.room.startGame }}
        </SiteActivityButton>
      </div>
      <p v-else class="pictionary-waiting-host">
        {{ waitingLabel }}
      </p>
    </SiteActivityPanel>
  </section>
</template>

<style scoped>
.pictionary-room-lobby {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
  gap: 24px;
  padding-block: clamp(24px, 6vw, 56px);
}

.pictionary-room-lobby__intro {
  align-self: center;
}

.pictionary-room-lobby__panel {
  padding: 16px;
}

.pictionary-player-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.pictionary-player-list li {
  display: grid;
  min-height: 44px;
  grid-template-columns: 32px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--saier-color-border);
}

.pictionary-player-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 7px;
  background: var(--saier-color-surface-hover);
  color: var(--saier-color-text-muted);
  font-size: 10px;
  font-weight: 750;
}

.pictionary-player-copy {
  min-width: 0;
}

.pictionary-player-copy strong,
.pictionary-player-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pictionary-player-copy strong {
  font-size: 12px;
}

.pictionary-player-copy small {
  margin-top: 2px;
  color: var(--saier-color-text-subtle);
  font-size: 10px;
}

.pictionary-host-badge {
  color: var(--saier-color-accent-text);
  font-size: 9px;
  font-weight: 750;
  text-transform: uppercase;
}

.pictionary-online-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--saier-color-success);
}

.pictionary-online-dot.is-offline {
  background: var(--saier-color-text-disabled);
}

.pictionary-lobby-settings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--saier-color-border);
}

.pictionary-lobby-settings__start {
  grid-column: 1 / -1;
}

.pictionary-waiting-host {
  margin: 14px 0 0;
  color: var(--saier-color-text-subtle);
  font-size: 11px;
}

@media (max-width: 760px) {
  .pictionary-room-lobby {
    grid-template-columns: 1fr;
    padding-block: 16px 24px;
  }
}
</style>
