<script setup lang="ts">
import type { Painter } from 'pixi-painter'

import { createPainter } from 'pixi-painter'

// const online = useOnline()

const srcCanvas = ref<HTMLCanvasElement>()
const targetCanvas = ref<HTMLCanvasElement>()

const painter = ref<Painter>()
onMounted(async () => {
  if (!srcCanvas.value)
    return

  // v8: Application is async-init — await init() before exposing the painter,
  // otherwise the UI (e.g. PainterControls reading painter.background) renders
  // against an uninitialised renderer.
  const p = createPainter({
    debug: import.meta.env.DEV,
    view: srcCanvas.value,
  })
  await p.init()
  painter.value = p
})
</script>

<template>
  <div px-10>
    <Logos mb-6 />

    <template v-if="painter">
      <PainterControls :painter="painter" class="absolute left-1" />
      <PainterOptionsBar :painter="painter" class="absolute left-1 top-1" />
    </template>

    <Suspense>
      <ClientOnly />
      <template #fallback>
        <div italic op50>
          <span animate-pulse>Loading...</span>
        </div>
      </template>
    </Suspense>

    <div class="canvas-container" grid="~ cols-2" gap="2">
      <canvas ref="srcCanvas" class="h-full w-full rounded shadow" />

      <canvas ref="targetCanvas" class="h-full w-full rounded shadow" />
    </div>
  </div>
</template>

<style lang="scss">
.canvas-container {
  height: calc(100vh - 200px);
}
</style>
