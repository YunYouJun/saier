<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { usePainter } from '@saier/vue/composables/usePainter'
import axios from 'axios'
import consola from 'consola'
import { ref, watch } from 'vue'

axios.defaults.baseURL = 'http://localhost:8080/api'

const targetCanvas = ref<HTMLCanvasElement>()
const inputPrompt = ref('椅子， 杰作, 最好质量，')

const {
  activeLayerId,
  canvas: srcCanvas,
  layerActions,
  layerThumbnails,
  layers,
  painter,
} = usePainter()

function setSrcCanvas(element: Element | ComponentPublicInstance | null): void {
  srcCanvas.value = element instanceof HTMLCanvasElement ? element : undefined
}

watch(painter, (p, _previous, onCleanup) => {
  if (!p)
    return

  consola.log(p)

  const onBrushUp = async () => {
    consola.log('brush:up')

    const extractedCanvas = await p.extractCanvas('canvas') as HTMLCanvasElement
    extractedCanvas.toBlob((blob) => {
      if (!blob)
        return

      const formData = new FormData()
      formData.append('image', blob, 'Paint_0.png')
      formData.append('overwrite', 'true')
      axios.post('http://localhost:8188/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }).then(async () => {
        const { data: imageBlob } = await axios.get('/queue', {
          params: {
            prompt: encodeURIComponent(inputPrompt.value),
          },
          responseType: 'blob',
        })

        const tCanvas = targetCanvas.value
        if (!tCanvas)
          return

        const ctx = tCanvas.getContext('2d')
        const imageObjectURL = URL.createObjectURL(imageBlob)

        const image = new Image()
        image.onload = () => {
          ctx?.drawImage(image, 0, 0, tCanvas.width, tCanvas.height)
        }
        image.src = imageObjectURL
      })
    }, 'image/png')
  }

  p.emitter.on('brush:up', onBrushUp)
  onCleanup(() => {
    p.emitter.off('brush:up', onBrushUp)
  })
})
</script>

<template>
  <div px-10>
    <Logos mb-6 />

    <template v-if="painter">
      <PainterControls :painter="painter" class="absolute left-1" />
      <PainterOptionsBar :painter="painter" class="absolute left-1 top-1" />
      <PainterLayerPanel
        class="absolute right-2 top-2"
        :layers="layers"
        :active-layer-id="activeLayerId"
        :thumbnails="layerThumbnails"
        @add="layerActions.add"
        @remove="layerActions.remove"
        @move="layerActions.move"
        @select="layerActions.setActive"
        @update:visible="layerActions.setVisible"
        @update:opacity="layerActions.setOpacity"
        @update:blend-mode="layerActions.setBlendMode"
        @update:label="layerActions.setLabel"
      />
    </template>

    <div class="canvas-container" grid="~ cols-2" gap="2">
      <div h-full w-full text-center shadow>
        <canvas :ref="setSrcCanvas" width="768" height="768" class="m-auto rounded" />
      </div>
      <div h-full w-full text-center>
        <canvas ref="targetCanvas" width="768" height="768" class="m-auto rounded bg-gray" />
      </div>
    </div>

    <div class="mt-6">
      <input v-model="inputPrompt" class="w-80% rounded px-4 py-2" placeholder="请输入关键词">
    </div>
  </div>
</template>

<style lang="scss">
.canvas-container {
  text-align: center;
  height: calc(100vh - 30rem);
}
</style>
