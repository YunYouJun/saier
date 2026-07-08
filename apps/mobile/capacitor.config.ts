import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cn.yunyoujun.saier',
  appName: 'Saier',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#0f1012',
      overlaysWebView: false,
      style: 'DARK',
    },
  },
}

export default config
