<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from '#imports'
import { validateCustomWordBank } from '@saier/collaboration'
import { useYunlefunRoomActivities } from '~/composables/useYunlefunRoomActivities'

const router = useRouter()
const activities = useYunlefunRoomActivities()
const title = ref('周末你画我猜')
const customWords = ref('')
const joinTarget = ref('')
const formError = ref('')

const parsedWords = computed(() => customWords.value
  .split(/[\n,，]/u)
  .map(word => word.trim())
  .filter(Boolean))

async function createGame(): Promise<void> {
  formError.value = ''
  try {
    const words = parsedWords.value.length > 0 ? validateCustomWordBank(parsedWords.value) : undefined
    const created = await activities.createRoom(title.value)
    const activated = await activities.activatePictionary({
      commandId: crypto.randomUUID(),
      config: { customBank: Boolean(words) },
      roomId: created.session.room.id,
      words,
    })
    await router.push({
      path: `/games/pictionary/${created.session.room.id}`,
      query: created.inviteToken ? { invite: created.inviteToken, session: activated.sessionId } : undefined,
    })
  }
  catch (error) {
    formError.value = error instanceof Error ? error.message : '创建失败，请稍后重试'
  }
}

async function joinGame(): Promise<void> {
  const value = joinTarget.value.trim()
  if (!value)
    return
  try {
    const url = new URL(value, window.location.origin)
    const segments = url.pathname.split('/').filter(Boolean)
    const roomId = segments.at(-1) ?? value
    await router.push({
      path: `/games/pictionary/${roomId}`,
      query: url.searchParams.get('invite') ? { invite: url.searchParams.get('invite')! } : undefined,
    })
  }
  catch {
    await router.push(`/games/pictionary/${value}`)
  }
}
</script>

<template>
  <main class="pictionary-home">
    <header class="pictionary-home__brand">
      <NuxtLink to="/" class="pictionary-home__back">
        <span class="i-ph-arrow-left" />
        返回 Saier
      </NuxtLink>
      <span class="pictionary-home__eyebrow">SAIER ACTIVITY</span>
      <h1>你画，我猜。</h1>
      <p>临时游戏画布与主工程完全分开。开局、分享链接，最多 12 人一起玩。</p>
    </header>

    <section v-if="activities.features.pictionary" class="pictionary-home__grid">
      <form class="pictionary-card" @submit.prevent="createGame">
        <div class="pictionary-card__heading">
          <span class="i-ph-pencil-circle" />
          <div>
            <h2>创建房间</h2>
            <p>默认 2 轮、每轮 90 秒</p>
          </div>
        </div>

        <label>
          <span>房间名称</span>
          <input v-model="title" maxlength="96" autocomplete="off">
        </label>

        <label>
          <span>自定义题库 <small>可选，3–200 个</small></span>
          <textarea
            v-model="customWords"
            rows="5"
            placeholder="一行一个词；自定义题库会标记为休闲模式"
          />
        </label>

        <p v-if="formError || activities.lastError.value" class="pictionary-card__error" role="alert">
          {{ formError || activities.lastError.value }}
        </p>
        <button class="pictionary-button is-primary" type="submit" :disabled="activities.busy.value">
          {{ activities.busy.value ? '正在创建…' : '创建并进入 Lobby' }}
        </button>
      </form>

      <form class="pictionary-card is-join" @submit.prevent="joinGame">
        <div class="pictionary-card__heading">
          <span class="i-ph-users-three" />
          <div>
            <h2>加入游戏</h2>
            <p>粘贴邀请链接或房间 ID</p>
          </div>
        </div>
        <label>
          <span>邀请链接</span>
          <input v-model="joinTarget" autocomplete="off" placeholder="https://…/games/pictionary/sr_…">
        </label>
        <button class="pictionary-button" type="submit" :disabled="!joinTarget.trim()">
          进入房间
        </button>
        <div class="pictionary-card__notes">
          <span><i class="i-ph-lock-key" />答案仅由服务端私密投影返回</span>
          <span><i class="i-ph-cloud-check" />断线后从持久事件恢复</span>
          <span><i class="i-ph-paint-brush" />不会写入主工程</span>
        </div>
      </form>
    </section>

    <section v-else class="pictionary-card pictionary-home__disabled">
      <h2>功能尚未开放</h2>
      <p>Pictionary feature flag 当前关闭。</p>
    </section>
  </main>
</template>

<style scoped>
.pictionary-home {
  min-height: 100dvh;
  padding: clamp(24px, 5vw, 72px);
  color: #221f1e;
  background: #f5f0e8;
}

.pictionary-home__brand,
.pictionary-home__grid {
  width: min(1040px, 100%);
  margin-inline: auto;
}

.pictionary-home__brand {
  position: relative;
  padding-block: 32px 40px;
}

.pictionary-home__back {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 48px;
  color: #5d5752;
  text-decoration: none;
}

.pictionary-home__eyebrow {
  display: block;
  margin-bottom: 10px;
  color: #e8402e;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .16em;
}

.pictionary-home h1 {
  margin: 0;
  font-size: clamp(44px, 8vw, 88px);
  line-height: .95;
  letter-spacing: -.06em;
}

.pictionary-home__brand > p {
  max-width: 620px;
  margin: 20px 0 0;
  color: #625c57;
  font-size: 17px;
  line-height: 1.7;
}

.pictionary-home__grid {
  display: grid;
  grid-template-columns: 1.1fr .9fr;
  gap: 18px;
}

.pictionary-card {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: clamp(22px, 4vw, 36px);
  border: 1px solid #cfc6bc;
  border-radius: 18px;
  background: rgb(255 253 249 / 94%);
  box-shadow: 0 18px 50px rgb(64 48 38 / 10%);
}

.pictionary-card__heading {
  display: flex;
  align-items: center;
  gap: 14px;
}

.pictionary-card__heading > span {
  color: #e8402e;
  font-size: 34px;
}

.pictionary-card h2,
.pictionary-card p {
  margin: 0;
}

.pictionary-card__heading p,
.pictionary-card__notes {
  color: #756e68;
  font-size: 13px;
}

.pictionary-card label,
.pictionary-card__notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pictionary-card label > span {
  font-size: 13px;
  font-weight: 700;
}

.pictionary-card small {
  color: #8a827c;
  font-weight: 500;
}

.pictionary-card input,
.pictionary-card textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid #cfc6bc;
  border-radius: 10px;
  outline: none;
  background: #fff;
  color: inherit;
  font: inherit;
}

.pictionary-card input:focus,
.pictionary-card textarea:focus {
  border-color: #e8402e;
  box-shadow: 0 0 0 3px rgb(232 64 46 / 12%);
}

.pictionary-button {
  min-height: 46px;
  padding: 0 18px;
  border: 1px solid #272220;
  border-radius: 10px;
  background: #fff;
  color: #272220;
  font-weight: 800;
  cursor: pointer;
}

.pictionary-button.is-primary {
  border-color: #e8402e;
  background: #e8402e;
  color: #fff;
}

.pictionary-button:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.pictionary-card__notes {
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid #e7dfd7;
}

.pictionary-card__notes span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pictionary-card__error {
  color: #b42318;
  font-size: 13px;
}

.pictionary-home__disabled {
  width: min(620px, 100%);
  margin-inline: auto;
}

@media (max-width: 760px) {
  .pictionary-home {
    padding: 20px 16px 40px;
  }

  .pictionary-home__brand {
    padding-top: 12px;
  }

  .pictionary-home__back {
    margin-bottom: 36px;
  }

  .pictionary-home__grid {
    grid-template-columns: 1fr;
  }
}
</style>
