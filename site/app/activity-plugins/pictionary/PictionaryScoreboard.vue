<script setup lang="ts">
import type { PictionaryPlayer } from '@saier/collaboration'
import { SiteActivityButton, SiteActivityPanel } from '~/components/activity'
import { usePictionaryI18n } from './i18n'

defineProps<{
  currentUserId: string
  isHost: boolean
  players: readonly PictionaryPlayer[]
  warning: string
}>()

const emit = defineEmits<{
  toggleMute: [payload: { muted: boolean, userId: string }]
}>()

const { text } = usePictionaryI18n()
</script>

<template>
  <SiteActivityPanel
    class="pictionary-scoreboard"
    icon="i-ph-ranking"
    tag="aside"
    :title="text.room.scoreboard"
  >
    <ol>
      <li v-for="(player, index) in players" :key="player.userId">
        <span class="pictionary-scoreboard__rank">{{ index + 1 }}</span>
        <span class="pictionary-scoreboard__name">
          {{ player.userId }}
          <small v-if="player.userId === currentUserId">{{ text.room.you }}</small>
        </span>
        <strong>{{ player.score }}</strong>
        <SiteActivityButton
          v-if="isHost && player.userId !== currentUserId"
          class="pictionary-scoreboard__mute"
          size="compact"
          @click="emit('toggleMute', { muted: !player.muted, userId: player.userId })"
        >
          {{ player.muted ? text.room.unmute : text.room.mute }}
        </SiteActivityButton>
      </li>
    </ol>
    <p v-if="warning" class="site-activity-error">
      {{ warning }}
    </p>
  </SiteActivityPanel>
</template>

<style scoped>
.pictionary-scoreboard {
  align-self: start;
  margin-top: 54px;
  padding: 12px;
}

.pictionary-scoreboard ol {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.pictionary-scoreboard li {
  display: grid;
  min-height: 40px;
  grid-template-columns: 24px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid var(--saier-color-border);
  font-size: 11px;
}

.pictionary-scoreboard__rank {
  color: var(--saier-color-text-subtle);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.pictionary-scoreboard__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pictionary-scoreboard__name small {
  margin-left: 5px;
  color: var(--saier-color-accent-text);
}

.pictionary-scoreboard strong {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.pictionary-scoreboard__mute {
  min-height: 26px;
  padding-inline: 6px;
  font-size: 9px;
}

.pictionary-scoreboard .site-activity-error {
  margin-top: 10px;
}

@media (max-width: 860px) {
  .pictionary-scoreboard {
    order: 2;
    margin-top: 0;
  }
}
</style>
