import { usePainter } from '@saier/vue/composables/usePainter'
import { computed, ref, unref, watch } from 'vue'
import { postImage } from '../api/index'
import { modalOptions } from './global'

interface Tree {
  name: string
  visible: boolean
  children: Tree[]
}

export function usePixiPainter() {
  const targetCanvas = ref<HTMLCanvasElement>()
  const {
    activeLayerId,
    canvas: srcCanvas,
    layerActions,
    layerMaskThumbnails,
    layerThumbnails,
    layerTree,
    layers,
    navigatorActions,
    navigatorThumbnail,
    paintTarget,
    painter,
    viewport,
  } = usePainter({
    debug: import.meta.env.DEV,
    size: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    afterInit: async (p) => {
      await p.loadImage('https://pixijs.com/assets/flowerTop.png')

      const tCanvas = targetCanvas.value
      if (tCanvas) {
        tCanvas.width = tCanvas.parentElement?.clientWidth || 0
        tCanvas.height = tCanvas.parentElement?.clientHeight || 0
      }
    },
  })

  const data = computed<Tree[]>(() =>
    layers.value
      .slice()
      .reverse()
      .map(layer => ({
        name: layer.label,
        visible: layer.visible,
        children: [],
      })),
  )

  function onExtract(dataUrl: string) {
    const img = new Image()

    const tCanvas = targetCanvas.value
    if (!tCanvas)
      return

    const ctx = tCanvas.getContext('2d')
    img.onload = () => {
      if (!ctx)
        return

      ctx.drawImage(img, 0, 0, tCanvas.width, tCanvas.height)
    }
    img.crossOrigin = 'anonymous'
    img.src = dataUrl
  }

  watch(painter, (p, _previous, onCleanup) => {
    if (!p)
      return

    const handleHistoryRecord = async () => {
      const extractedData = await p.extractCanvas('canvas') as HTMLCanvasElement
      extractedData.toBlob(async (blob) => {
        if (!blob)
          return

        const res = await postImage({
          image: blob,
          ...unref(modalOptions),
        })
        onExtract(URL.createObjectURL(res.data))
      })
    }

    p.emitter.on('history:record', handleHistoryRecord)
    onCleanup(() => {
      p.emitter.off('history:record', handleHistoryRecord)
    })
  })

  return {
    activeLayerId,
    data,
    layerActions,
    layerMaskThumbnails,
    layerThumbnails,
    layerTree,
    layers,
    navigatorActions,
    navigatorThumbnail,
    onExtract,
    paintTarget,
    painter,
    srcCanvas,
    targetCanvas,
    viewport,
  }
}
