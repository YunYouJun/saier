<script setup lang="ts">
import type {
  SetRoomMemberRoleOptions,
  SetRoomModeOptions,
  YunlefunCloudRoomSession,
  YunlefunCloudRoomStatus,
} from '~/composables/useYunlefunCloudRooms'
import { computed, shallowRef, watch } from 'vue'
import SiteCloudRoomOwnerPanel from './SiteCloudRoomOwnerPanel.vue'

interface SiteCloudRoomDialogLabels {
  backendGated: string
  close: string
  copyLink: string
  create: string
  createTitle: string
  creating: string
  driverEditor: string
  errorTitle: string
  join: string
  joinInput: string
  joinTitle: string
  joining: string
  leave: string
  members: string
  modeDriver: string
  modeMultiEditor: string
  modeViewer: string
  noEditorAvailable: string
  notAuthenticated: string
  owner: string
  ownerTools: string
  readOnly: string
  roleEditor: string
  roleOwner: string
  roleViewer: string
  roomMode: string
  saveRoomMode: string
  setRoleEditor: string
  setRoleViewer: string
  share: string
  shareLink: string
  signIn: string
  status: string
  title: string
}

const props = defineProps<{
  defaultTitle: string
  errorMessage: string
  isAuthenticated: boolean
  labels: SiteCloudRoomDialogLabels
  open: boolean
  session: YunlefunCloudRoomSession | null
  shareUrl: string
  status: YunlefunCloudRoomStatus
  uploadProgress: number
}>()

const emit = defineEmits<{
  close: []
  create: [title: string]
  join: [link: string]
  leave: []
  login: []
  setMemberRole: [options: SetRoomMemberRoleOptions]
  setRoomMode: [options: SetRoomModeOptions]
  share: []
}>()

const roomTitle = shallowRef('')
const joinLink = shallowRef('')

const isBusy = computed(() =>
  props.status === 'creating'
  || props.status === 'joining'
  || props.status === 'leaving'
  || props.status === 'syncing'
  || props.status === 'sharing',
)
const createDisabled = computed(() => isBusy.value || !props.isAuthenticated || !roomTitle.value.trim())
const joinDisabled = computed(() => isBusy.value || !props.isAuthenticated || !joinLink.value.trim())
const statusLabel = computed(() => {
  switch (props.status) {
    case 'creating':
      return `${props.labels.creating} ${Math.round(props.uploadProgress * 100)}%`
    case 'joining':
      return props.labels.joining
    case 'leaving':
    case 'syncing':
      return props.labels.status
    case 'sharing':
      return props.labels.share
    case 'error':
      return props.labels.errorTitle
    case 'idle':
      return props.session ? props.labels.status : ''
  }
})

watch(
  () => props.open,
  (open) => {
    if (!open)
      return

    roomTitle.value = props.defaultTitle
  },
  { immediate: true },
)

function submitCreate(): void {
  const title = roomTitle.value.trim()
  if (title)
    emit('create', title)
}

function submitJoin(): void {
  const link = joinLink.value.trim()
  if (link)
    emit('join', link)
}

function roleLabel(role: YunlefunCloudRoomSession['role']): string {
  switch (role) {
    case 'editor':
      return props.labels.roleEditor
    case 'owner':
      return props.labels.roleOwner
    case 'viewer':
      return props.labels.roleViewer
  }
}
</script>

<template>
  <div v-if="open" class="site-cloud-room" role="dialog" aria-modal="true" :aria-label="labels.title">
    <section class="site-cloud-room__panel">
      <header class="site-cloud-room__header">
        <div>
          <h2 class="site-cloud-room__title">
            {{ labels.title }}
          </h2>
          <p class="site-cloud-room__hint">
            {{ labels.backendGated }}
          </p>
        </div>
        <button type="button" class="site-cloud-room__icon" :title="labels.close" @click="emit('close')">
          <span class="i-ph-x" />
        </button>
      </header>

      <p v-if="!isAuthenticated" class="site-cloud-room__notice">
        <span>{{ labels.notAuthenticated }}</span>
        <button type="button" class="site-cloud-room__link" @click="emit('login')">
          {{ labels.signIn }}
        </button>
      </p>

      <p v-if="statusLabel" class="site-cloud-room__status">
        {{ statusLabel }}
      </p>
      <p v-if="errorMessage" class="site-cloud-room__error">
        {{ errorMessage }}
      </p>

      <section v-if="session" class="site-cloud-room__session">
        <div class="site-cloud-room__room-title">
          <span class="i-ph-broadcast" />
          <strong>{{ session.room.title }}</strong>
          <em>{{ session.readOnly ? labels.readOnly : roleLabel(session.role) }}</em>
        </div>

        <label class="site-cloud-room__field">
          <span>{{ labels.shareLink }}</span>
          <input class="site-cloud-room__input" type="text" readonly :value="shareUrl">
        </label>

        <div class="site-cloud-room__actions">
          <button type="button" class="site-cloud-room__button site-cloud-room__button--primary" :disabled="!shareUrl || isBusy" @click="emit('share')">
            <span class="i-ph-share-network" />
            <span>{{ labels.share }}</span>
          </button>
          <button type="button" class="site-cloud-room__button" :disabled="isBusy" @click="emit('leave')">
            <span class="i-ph-sign-out" />
            <span>{{ labels.leave }}</span>
          </button>
        </div>

        <div class="site-cloud-room__members">
          <span class="site-cloud-room__caption">{{ labels.members }}</span>
          <div v-for="member in session.members" :key="member.userId" class="site-cloud-room__member">
            <span class="site-cloud-room__presence" :class="{ 'is-online': member.online }" />
            <span>{{ member.displayName || member.userId }}</span>
            <small>{{ roleLabel(member.role) }}</small>
          </div>
        </div>

        <SiteCloudRoomOwnerPanel
          v-if="session.role === 'owner'"
          :disabled="isBusy"
          :labels="labels"
          :session="session"
          @set-member-role="emit('setMemberRole', $event)"
          @set-room-mode="emit('setRoomMode', $event)"
        />
      </section>

      <div v-else class="site-cloud-room__forms">
        <form class="site-cloud-room__form" @submit.prevent="submitCreate">
          <h3>{{ labels.createTitle }}</h3>
          <label class="site-cloud-room__field">
            <span>{{ labels.createTitle }}</span>
            <input v-model="roomTitle" class="site-cloud-room__input" type="text" autocomplete="off">
          </label>
          <button type="submit" class="site-cloud-room__button site-cloud-room__button--primary" :disabled="createDisabled">
            <span class="i-ph-broadcast" />
            <span>{{ labels.create }}</span>
          </button>
        </form>

        <form class="site-cloud-room__form" @submit.prevent="submitJoin">
          <h3>{{ labels.joinTitle }}</h3>
          <label class="site-cloud-room__field">
            <span>{{ labels.joinInput }}</span>
            <input v-model="joinLink" class="site-cloud-room__input" type="text" autocomplete="off">
          </label>
          <button type="submit" class="site-cloud-room__button" :disabled="joinDisabled">
            <span class="i-ph-link" />
            <span>{{ labels.join }}</span>
          </button>
        </form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.site-cloud-room {
  position: fixed;
  z-index: 120;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(10 11 13 / 62%);
  padding: 20px;
}

.site-cloud-room__panel {
  display: grid;
  width: min(680px, 100%);
  max-height: min(760px, calc(100dvh - 40px));
  grid-template-rows: auto;
  overflow: auto;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  background: #17181b;
  box-shadow: 0 24px 72px rgb(0 0 0 / 38%);
  color: white;
  padding: 16px;
  gap: 12px;
}

.site-cloud-room__header,
.site-cloud-room__actions,
.site-cloud-room__room-title,
.site-cloud-room__member {
  display: flex;
  min-width: 0;
  align-items: center;
}

.site-cloud-room__header {
  justify-content: space-between;
  gap: 12px;
}

.site-cloud-room__title,
.site-cloud-room__form h3 {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
}

.site-cloud-room__hint,
.site-cloud-room__caption,
.site-cloud-room__member small {
  color: rgb(255 255 255 / 54%);
  font-size: 12px;
  line-height: 16px;
}

.site-cloud-room__hint {
  margin: 4px 0 0;
}

.site-cloud-room__icon,
.site-cloud-room__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 7px;
  background: rgb(255 255 255 / 6%);
  color: white;
}

.site-cloud-room__icon {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
}

.site-cloud-room__button {
  min-height: 34px;
  gap: 7px;
  padding: 0 12px;
  font-size: 12px;
}

.site-cloud-room__button--primary {
  border-color: rgb(96 165 250 / 56%);
  background: rgb(96 165 250 / 18%);
}

.site-cloud-room__button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.site-cloud-room__notice,
.site-cloud-room__status,
.site-cloud-room__error,
.site-cloud-room__session,
.site-cloud-room__form {
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(255 255 255 / 5%);
  padding: 10px;
}

.site-cloud-room__notice {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  color: rgb(255 255 255 / 72%);
  font-size: 12px;
}

.site-cloud-room__link {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: #60a5fa;
  font-size: 12px;
}

.site-cloud-room__status,
.site-cloud-room__error {
  margin: 0;
  font-size: 12px;
}

.site-cloud-room__status {
  color: #34d399;
}

.site-cloud-room__error {
  color: #f87171;
}

.site-cloud-room__session,
.site-cloud-room__forms,
.site-cloud-room__form,
.site-cloud-room__members,
.site-cloud-room__field {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.site-cloud-room__forms {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.site-cloud-room__room-title {
  gap: 9px;
}

.site-cloud-room__room-title strong {
  min-width: 0;
  overflow: hidden;
  flex: 1 1 auto;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-cloud-room__room-title em {
  flex: 0 0 auto;
  border: 1px solid rgb(52 211 153 / 40%);
  border-radius: 999px;
  color: #34d399;
  font-size: 11px;
  font-style: normal;
  padding: 2px 7px;
}

.site-cloud-room__field span {
  color: rgb(255 255 255 / 62%);
  font-size: 12px;
}

.site-cloud-room__input {
  width: 100%;
  min-width: 0;
  border: 1px solid #2f3338;
  border-radius: 7px;
  background: rgb(0 0 0 / 22%);
  color: white;
  font-size: 12px;
  line-height: 18px;
  padding: 8px 9px;
}

.site-cloud-room__actions {
  flex-wrap: wrap;
  gap: 8px;
}

.site-cloud-room__members {
  border-top: 1px solid rgb(255 255 255 / 9%);
  padding-top: 10px;
}

.site-cloud-room__member {
  gap: 8px;
  font-size: 12px;
}

.site-cloud-room__member span:nth-child(2) {
  min-width: 0;
  overflow: hidden;
  flex: 1 1 auto;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-cloud-room__presence {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgb(255 255 255 / 26%);
}

.site-cloud-room__presence.is-online {
  background: #34d399;
}

@media (max-width: 680px) {
  .site-cloud-room {
    align-items: end;
    padding: 10px;
  }

  .site-cloud-room__panel {
    max-height: calc(100dvh - 20px);
  }

  .site-cloud-room__forms {
    grid-template-columns: 1fr;
  }
}
</style>
