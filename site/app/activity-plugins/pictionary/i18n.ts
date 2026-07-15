import type { PictionaryPhase, PictionaryPlayerStatus } from '@saier/collaboration'
import type { ComputedRef } from 'vue'
import type { SiteLocale } from '~/composables/useSiteI18n'
import { computed } from 'vue'
import { useSiteI18n } from '~/composables/useSiteI18n'

export type PictionaryTool = 'eraser' | 'marker' | 'pen'

export interface PictionaryMessages {
  errors: {
    createFailed: string
    gameMissing: string
    guessFailed: string
    invalidJoinTarget: string
    invalidWordBank: string
    joinFailed: string
    noRound: string
    promptSyncFailed: string
    replayMismatch: string
    sessionEnded: string
    stateUnavailable: string
    strokeFailed: string
    syncFailed: string
  }
  lobby: {
    answerPrivacy: string
    create: string
    createDescription: string
    createTitle: string
    creating: string
    customWordBank: string
    defaultRoomName: string
    defaultRules: string
    description: string
    disabledDescription: string
    disabledTitle: string
    documentIsolation: string
    enterRoom: string
    inviteLink: string
    invitePlaceholder: string
    joinDescription: string
    joinTitle: string
    optionalWordBank: string
    reconnectRecovery: string
    roomName: string
    title: string
    wordBankPlaceholder: string
  }
  phases: Record<PictionaryPhase, string>
  playerStatus: Record<PictionaryPlayerStatus, string>
  room: {
    answer: string
    brushColor: string
    brushSize: string
    canvasSyncing: string
    choosePrompt: string
    chooseThree: string
    copiedInvite: string
    copyInvite: string
    correctGuess: string
    cycles: string
    drawer: string
    drawerChoosing: string
    finalScore: string
    guess: string
    guessPlaceholder: string
    host: string
    invite: string
    lobbyDescription: string
    lobbyKicker: string
    mute: string
    perRound: string
    playAgain: string
    playerCount: string
    players: string
    pollingTransport: string
    realtimeTransport: string
    returnLobby: string
    scoreboard: string
    seconds: string
    startGame: string
    syncFinalStroke: string
    syncingPrompt: string
    takeControl: string
    title: string
    unableEnter: string
    unmute: string
    waitingHost: string
    winner: string
    you: string
    yourPrompt: string
  }
  tools: Record<PictionaryTool, string>
}

const PICTIONARY_MESSAGES = {
  en: {
    errors: {
      createFailed: 'Could not create the room. Try again later.',
      gameMissing: 'This room does not have an active game yet.',
      guessFailed: 'Could not submit your guess.',
      invalidJoinTarget: 'Enter a valid invite link or room ID.',
      invalidWordBank: 'Use 3–200 unique, non-empty words.',
      joinFailed: 'Could not join the room.',
      noRound: 'There is no active round.',
      promptSyncFailed: 'Could not sync the private prompt.',
      replayMismatch: 'The canvas replay differs. Waiting for the next snapshot.',
      sessionEnded: 'This game has ended.',
      stateUnavailable: 'The game state is still syncing.',
      strokeFailed: 'Could not commit this stroke.',
      syncFailed: 'Could not sync the game state.',
    },
    lobby: {
      answerPrivacy: 'Answers are returned only through private server projections',
      create: 'Create and enter lobby',
      createDescription: '2 rounds · 90 seconds each by default',
      createTitle: 'Create room',
      creating: 'Creating...',
      customWordBank: 'Custom word bank',
      defaultRoomName: 'Weekend Pictionary',
      defaultRules: '2 rounds · 90 seconds each',
      description: 'Open a temporary game canvas without changing the current painting document. Invite up to 12 players.',
      disabledDescription: 'The Pictionary feature flag is currently off.',
      disabledTitle: 'Activity unavailable',
      documentIsolation: 'Game strokes never enter the painting document',
      enterRoom: 'Enter room',
      inviteLink: 'Invite link or room ID',
      invitePlaceholder: 'Paste an invite link or room ID',
      joinDescription: 'Continue from an invite link or room ID',
      joinTitle: 'Join game',
      optionalWordBank: 'Optional · 3–200 entries',
      reconnectRecovery: 'Reconnect from persisted events',
      roomName: 'Room name',
      title: 'Pictionary',
      wordBankPlaceholder: 'One word per line; custom banks are marked as casual games',
    },
    phases: {
      choosing: 'Choosing a prompt',
      drawing: 'Drawing',
      finished: 'Game finished',
      lobby: 'Waiting to start',
      reveal: 'Reveal answer',
    },
    playerStatus: {
      active: 'Active player',
      left: 'Left',
      spectator: 'Spectator',
    },
    room: {
      answer: 'Answer',
      brushColor: 'Brush color',
      brushSize: 'Size {size}',
      canvasSyncing: 'Syncing canvas',
      choosePrompt: 'Choose a prompt to start drawing',
      chooseThree: 'Choose one',
      copiedInvite: 'Invite link copied',
      copyInvite: 'Copy invite link',
      correctGuess: 'Correct!',
      cycles: 'Rounds',
      drawer: 'Drawer: {drawer}',
      drawerChoosing: 'The drawer is choosing a prompt',
      finalScore: 'Final score',
      guess: 'Guess',
      guessPlaceholder: 'Enter your guess...',
      host: 'Host',
      invite: 'Invite',
      lobbyDescription: '{count} players joined. Players joining mid-game enter the drawing order next round.',
      lobbyKicker: 'Lobby',
      mute: 'Mute',
      perRound: 'Per round',
      playAgain: 'Play again',
      playerCount: '{count} players',
      players: 'Players',
      pollingTransport: 'Authority polling',
      realtimeTransport: 'Realtime · {state}',
      returnLobby: 'Return to game lobby',
      scoreboard: 'Scoreboard',
      seconds: '{count} sec',
      startGame: 'Start game',
      syncFinalStroke: 'Syncing final strokes',
      syncingPrompt: 'Syncing prompt...',
      takeControl: 'Take drawing control',
      title: 'Pictionary',
      unableEnter: 'Could not enter the game',
      unmute: 'Unmute',
      waitingHost: 'Waiting for {host} to start the game...',
      winner: '{player} wins',
      you: 'You',
      yourPrompt: 'Your prompt',
    },
    tools: {
      eraser: 'Eraser',
      marker: 'Marker',
      pen: 'Pen',
    },
  },
  zh: {
    errors: {
      createFailed: '创建失败，请稍后重试。',
      gameMissing: '房间尚未创建游戏。',
      guessFailed: '猜词失败。',
      invalidJoinTarget: '请输入有效的邀请链接或房间 ID。',
      invalidWordBank: '请输入 3–200 个不重复的有效词条。',
      joinFailed: '无法加入房间。',
      noRound: '当前没有进行中的回合。',
      promptSyncFailed: '同步题目失败。',
      replayMismatch: '画布回放出现差异，正在等待下一份快照。',
      sessionEnded: '本局已经结束。',
      stateUnavailable: '游戏状态尚未同步。',
      strokeFailed: '笔迹提交失败。',
      syncFailed: '同步失败。',
    },
    lobby: {
      answerPrivacy: '答案仅由服务端私密投影返回',
      create: '创建并进入大厅',
      createDescription: '默认 2 轮、每轮 90 秒',
      createTitle: '创建房间',
      creating: '正在创建…',
      customWordBank: '自定义题库',
      defaultRoomName: '周末你画我猜',
      defaultRules: '默认 2 轮 · 每轮 90 秒',
      description: '使用独立临时游戏画布，不修改当前绘画工程。创建房间后可邀请最多 12 人加入。',
      disabledDescription: 'Pictionary feature flag 当前关闭。',
      disabledTitle: '活动尚未开放',
      documentIsolation: '游戏笔迹不会写入主工程',
      enterRoom: '进入房间',
      inviteLink: '邀请链接或房间 ID',
      invitePlaceholder: '粘贴邀请链接或房间 ID',
      joinDescription: '通过邀请链接或房间 ID 继续',
      joinTitle: '加入游戏',
      optionalWordBank: '可选 · 3–200 个',
      reconnectRecovery: '断线后从持久事件恢复',
      roomName: '房间名称',
      title: '你画我猜',
      wordBankPlaceholder: '一行一个词；自定义题库会标记为休闲模式',
    },
    phases: {
      choosing: '画手选词',
      drawing: '绘画中',
      finished: '本局结束',
      lobby: '等待开局',
      reveal: '揭晓答案',
    },
    playerStatus: {
      active: '参与中',
      left: '已离开',
      spectator: '观战',
    },
    room: {
      answer: '答案',
      brushColor: '笔刷颜色',
      brushSize: '粗细 {size}',
      canvasSyncing: '画布同步中',
      choosePrompt: '选一个题目开始画',
      chooseThree: '三选一',
      copiedInvite: '邀请链接已复制',
      copyInvite: '复制邀请链接',
      correctGuess: '猜对了！',
      cycles: '轮数',
      drawer: '画手：{drawer}',
      drawerChoosing: '画手正在选题',
      finalScore: '最终得分',
      guess: '猜',
      guessPlaceholder: '输入你的答案…',
      host: '房主',
      invite: '邀请',
      lobbyDescription: '已有 {count} 位玩家加入。中途加入者会从下一局开始进入画手顺序。',
      lobbyKicker: '游戏大厅',
      mute: '静音',
      perRound: '每轮',
      playAgain: '再开一局',
      playerCount: '{count} 位玩家',
      players: '玩家',
      pollingTransport: '权威轮询',
      realtimeTransport: '实时链路 · {state}',
      returnLobby: '返回游戏大厅',
      scoreboard: '计分板',
      seconds: '{count} 秒',
      startGame: '开始游戏',
      syncFinalStroke: '同步最后笔迹',
      syncingPrompt: '正在同步题目…',
      takeControl: '接管绘制',
      title: '你画我猜',
      unableEnter: '无法进入游戏',
      unmute: '解除静音',
      waitingHost: '等待 {host} 开始游戏…',
      winner: '{player} 获胜',
      you: '你',
      yourPrompt: '你的题目',
    },
    tools: {
      eraser: '橡皮',
      marker: '马克笔',
      pen: '画笔',
    },
  },
} satisfies Record<SiteLocale, PictionaryMessages>

export function usePictionaryI18n(): { text: ComputedRef<PictionaryMessages> } {
  const { locale } = useSiteI18n()
  return {
    text: computed(() => PICTIONARY_MESSAGES[locale.value]),
  }
}

export function formatPictionaryMessage(
  message: string,
  values: Readonly<Record<string, number | string>>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    message,
  )
}
