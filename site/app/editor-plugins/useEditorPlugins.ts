import { computed, defineAsyncComponent, markRaw, onMounted, shallowRef } from 'vue'
import { editorPlugins } from './registry'

const STORAGE_KEY = 'saier:editor-plugins:v1'

/** Panel enablement is a local preference; closing a panel never disposes its document. */
export function useEditorPlugins() {
  const enabled = shallowRef<string[]>([])
  const components = Object.fromEntries(editorPlugins.map(plugin => [plugin.id, markRaw(defineAsyncComponent(plugin.load))]))
  const active = computed(() => editorPlugins.filter(plugin => enabled.value.includes(plugin.id)))
  onMounted(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
      if (Array.isArray(value))
        enabled.value = editorPlugins.filter(p => value.includes(p.id)).map(p => p.id)
    }
    catch { /* Storage may be unavailable; the editor still works. */ }
  })
  function toggle(id: string, value: boolean): void {
    if (!editorPlugins.some(plugin => plugin.id === id))
      return
    enabled.value = value ? [...new Set([...enabled.value, id])] : enabled.value.filter(item => item !== id)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled.value))
    }
    catch { /* In-memory preferences remain usable. */ }
  }
  return { all: editorPlugins, active, components, enabled, toggle }
}
