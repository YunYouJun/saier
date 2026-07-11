<script setup lang="ts">
import type {
  SetRoomMemberRoleOptions,
  SetRoomModeOptions,
  YunlefunCloudRoomMember,
  YunlefunCloudRoomMode,
  YunlefunCloudRoomRole,
  YunlefunCloudRoomSession,
} from '~/composables/useYunlefunCloudRooms'
import { computed, shallowRef, watch } from 'vue'

type EditableRoomRole = Exclude<YunlefunCloudRoomRole, 'owner'>

interface SiteCloudRoomOwnerPanelLabels {
  driverEditor: string
  modeDriver: string
  modeMultiEditor: string
  modeViewer: string
  members: string
  noEditorAvailable: string
  ownerTools: string
  roleEditor: string
  roleOwner: string
  roleViewer: string
  roomMode: string
  saveRoomMode: string
  setRoleEditor: string
  setRoleViewer: string
}

const props = defineProps<{
  disabled: boolean
  labels: SiteCloudRoomOwnerPanelLabels
  session: YunlefunCloudRoomSession
}>()

const emit = defineEmits<{
  setMemberRole: [options: SetRoomMemberRoleOptions]
  setRoomMode: [options: SetRoomModeOptions]
}>()

const selectedMode = shallowRef<YunlefunCloudRoomMode>(props.session.room.mode)
const selectedDriverUserId = shallowRef(props.session.room.driverUserId ?? '')

const editableMembers = computed(() =>
  props.session.members.filter(member => member.role !== 'owner'),
)
const editorMembers = computed(() =>
  props.session.members.filter(member => member.role === 'editor'),
)
const modeOptions = computed<Array<{ icon: string, label: string, mode: YunlefunCloudRoomMode }>>(() => [
  { icon: 'i-ph-eye', label: props.labels.modeViewer, mode: 'viewer' },
  { icon: 'i-ph-cursor-click', label: props.labels.modeDriver, mode: 'driver' },
  { icon: 'i-ph-users-three', label: props.labels.modeMultiEditor, mode: 'multi-editor' },
])
const normalizedDriverUserId = computed(() => {
  if (selectedMode.value !== 'driver')
    return undefined

  const selected = editorMembers.value.find(member => member.userId === selectedDriverUserId.value)
  return selected?.userId ?? editorMembers.value[0]?.userId ?? ''
})
const roomModeChanged = computed(() => {
  if (selectedMode.value !== props.session.room.mode)
    return true
  if (selectedMode.value !== 'driver')
    return false
  return (normalizedDriverUserId.value ?? '') !== (props.session.room.driverUserId ?? '')
})
const saveModeDisabled = computed(() =>
  props.disabled
  || !roomModeChanged.value
  || (selectedMode.value === 'driver' && !normalizedDriverUserId.value),
)

watch(
  () => [
    props.session.room.driverUserId,
    props.session.room.id,
    props.session.room.mode,
    props.session.members.map(member => `${member.userId}:${member.role}`).join('|'),
  ],
  () => {
    selectedMode.value = props.session.room.mode
    selectedDriverUserId.value = props.session.room.driverUserId
      ?? editorMembers.value[0]?.userId
      ?? ''
  },
  { immediate: true },
)

watch(editorMembers, (members) => {
  if (selectedMode.value !== 'driver')
    return
  if (!members.some(member => member.userId === selectedDriverUserId.value))
    selectedDriverUserId.value = members[0]?.userId ?? ''
})

function selectMode(mode: YunlefunCloudRoomMode): void {
  selectedMode.value = mode
  if (mode === 'driver' && !selectedDriverUserId.value)
    selectedDriverUserId.value = editorMembers.value[0]?.userId ?? ''
}

function saveRoomMode(): void {
  if (saveModeDisabled.value)
    return

  if (selectedMode.value === 'driver') {
    const driverUserId = normalizedDriverUserId.value
    if (!driverUserId)
      return
    emit('setRoomMode', {
      driverUserId,
      mode: selectedMode.value,
    })
    return
  }

  emit('setRoomMode', { mode: selectedMode.value })
}

function setMemberRole(member: YunlefunCloudRoomMember, role: EditableRoomRole): void {
  if (props.disabled || member.role === role)
    return

  emit('setMemberRole', {
    role,
    userId: member.userId,
  })
}

function roleLabel(role: YunlefunCloudRoomRole): string {
  switch (role) {
    case 'editor':
      return props.labels.roleEditor
    case 'owner':
      return props.labels.roleOwner
    case 'viewer':
      return props.labels.roleViewer
  }
}

function memberName(member: YunlefunCloudRoomMember): string {
  return member.displayName || member.userId
}
</script>

<template>
  <section class="site-cloud-room-owner">
    <h3 class="site-cloud-room-owner__title">
      {{ labels.ownerTools }}
    </h3>

    <div class="site-cloud-room-owner__mode">
      <span class="site-cloud-room-owner__caption">{{ labels.roomMode }}</span>
      <div class="site-cloud-room-owner__segmented">
        <button
          v-for="option in modeOptions"
          :key="option.mode"
          type="button"
          class="site-cloud-room-owner__mode-button"
          :class="{ 'is-active': selectedMode === option.mode }"
          :aria-pressed="selectedMode === option.mode"
          :title="option.label"
          :disabled="disabled"
          @click="selectMode(option.mode)"
        >
          <span :class="option.icon" />
          <span>{{ option.label }}</span>
        </button>
      </div>

      <label v-if="selectedMode === 'driver'" class="site-cloud-room-owner__field">
        <span>{{ labels.driverEditor }}</span>
        <select
          v-model="selectedDriverUserId"
          class="site-cloud-room-owner__select"
          :disabled="disabled || editorMembers.length === 0"
        >
          <option v-for="member in editorMembers" :key="member.userId" :value="member.userId">
            {{ memberName(member) }}
          </option>
        </select>
      </label>
      <p v-if="selectedMode === 'driver' && editorMembers.length === 0" class="site-cloud-room-owner__note">
        {{ labels.noEditorAvailable }}
      </p>

      <button
        type="button"
        class="site-cloud-room-owner__button site-cloud-room-owner__button--primary"
        :disabled="saveModeDisabled"
        :title="labels.saveRoomMode"
        @click="saveRoomMode"
      >
        <span class="i-ph-check" />
        <span>{{ labels.saveRoomMode }}</span>
      </button>
    </div>

    <div v-if="editableMembers.length" class="site-cloud-room-owner__members">
      <span class="site-cloud-room-owner__caption">{{ labels.members }}</span>
      <div
        v-for="member in editableMembers"
        :key="member.userId"
        class="site-cloud-room-owner__member"
        :data-user-id="member.userId"
      >
        <span class="site-cloud-room-owner__presence" :class="{ 'is-online': member.online }" />
        <strong>{{ memberName(member) }}</strong>
        <small>{{ roleLabel(member.role) }}</small>
        <div class="site-cloud-room-owner__role-actions">
          <button
            type="button"
            class="site-cloud-room-owner__button"
            data-role="viewer"
            :disabled="disabled || member.role === 'viewer'"
            :title="labels.setRoleViewer"
            @click="setMemberRole(member, 'viewer')"
          >
            <span class="i-ph-eye" />
            <span>{{ labels.roleViewer }}</span>
          </button>
          <button
            type="button"
            class="site-cloud-room-owner__button"
            data-role="editor"
            :disabled="disabled || member.role === 'editor'"
            :title="labels.setRoleEditor"
            @click="setMemberRole(member, 'editor')"
          >
            <span class="i-ph-pencil-simple" />
            <span>{{ labels.roleEditor }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.site-cloud-room-owner {
  display: grid;
  min-width: 0;
  gap: 12px;
  border-top: 1px solid rgb(255 255 255 / 9%);
  padding-top: 12px;
}

.site-cloud-room-owner__title {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
}

.site-cloud-room-owner__mode,
.site-cloud-room-owner__members,
.site-cloud-room-owner__field {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.site-cloud-room-owner__caption,
.site-cloud-room-owner__field span,
.site-cloud-room-owner__member small,
.site-cloud-room-owner__note {
  color: rgb(255 255 255 / 54%);
  font-size: 12px;
  line-height: 16px;
}

.site-cloud-room-owner__segmented,
.site-cloud-room-owner__member,
.site-cloud-room-owner__role-actions {
  display: flex;
  min-width: 0;
  align-items: center;
}

.site-cloud-room-owner__segmented {
  flex-wrap: wrap;
  gap: 6px;
}

.site-cloud-room-owner__button,
.site-cloud-room-owner__mode-button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 7px;
  background: rgb(255 255 255 / 6%);
  color: white;
  font-size: 12px;
  padding: 0 10px;
}

.site-cloud-room-owner__mode-button.is-active,
.site-cloud-room-owner__button--primary {
  border-color: rgb(96 165 250 / 56%);
  background: rgb(96 165 250 / 18%);
}

.site-cloud-room-owner__button:disabled,
.site-cloud-room-owner__mode-button:disabled,
.site-cloud-room-owner__select:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.site-cloud-room-owner__select {
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

.site-cloud-room-owner__note {
  margin: 0;
}

.site-cloud-room-owner__member {
  gap: 8px;
  font-size: 12px;
}

.site-cloud-room-owner__member strong {
  min-width: 0;
  overflow: hidden;
  flex: 1 1 auto;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-cloud-room-owner__role-actions {
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.site-cloud-room-owner__presence {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgb(255 255 255 / 26%);
}

.site-cloud-room-owner__presence.is-online {
  background: #34d399;
}

@media (max-width: 520px) {
  .site-cloud-room-owner__member {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .site-cloud-room-owner__role-actions {
    width: 100%;
  }

  .site-cloud-room-owner__button {
    flex: 1 1 120px;
  }
}
</style>
