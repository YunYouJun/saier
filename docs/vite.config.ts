import { getViteConfig } from '@yunyoujun/docs'
import { defineConfig } from 'vite'

// `getViteConfig` from `@yunyoujun/docs` already wires UnoCSS, group-icons
// and component auto-import. Docs pages don't import workspace source, so we
// intentionally omit `vite-tsconfig-paths` here.
export default defineConfig(getViteConfig({}))
