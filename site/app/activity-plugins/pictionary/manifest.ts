import type { SiteActivityPluginManifest } from '~/types/activity-plugin'

export const pictionaryActivityPluginManifest = {
  id: 'pictionary',
  icon: 'i-ph-game-controller',
  labels: {
    en: {
      close: 'Exit Pictionary',
      lobby: 'Activity lobby',
      menu: 'Pictionary...',
      room: 'Room',
      tab: 'Pictionary',
    },
    zh: {
      close: '退出你画我猜',
      lobby: '活动大厅',
      menu: '你画我猜...',
      room: '房间',
      tab: '你画我猜',
    },
  },
  load: () => import('./PictionaryActivityPlugin.vue'),
  presentation: 'workspace-tab',
  theme: 'inherit',
} satisfies SiteActivityPluginManifest<'pictionary'>
