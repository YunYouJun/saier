import type { Painter } from 'pixi-painter'
import type * as PIXI from 'pixi.js'
import { createPainter } from 'pixi-painter'
import { postImage } from '../api/index'

interface Tree {
  name: string
  visible: boolean
  children: Tree[]
}

function getLayersData(container: PIXI.Container) {
  const layers = container.children
  const layersData: Tree[] = []

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]
    // const layerData: Tree = {
    //   name: layer.name || `Layer ${depth} - ${i}`,
    //   visible: layer.visible,
    //   children: [],
    // }
    const layerData = layer as any as Tree

    // if (layer instanceof PIXI.Container && layer.children.length > 0)
    // layerData.children = getLayersData(layer, depth + 1)

    layersData.push(layerData)
  }

  return layersData
}

// ref will proxy painter
export function usePixiPainter() {
  const srcCanvas = ref<HTMLCanvasElement>()
  const targetCanvas = ref<HTMLCanvasElement>()
  const painter = shallowRef<Painter>()

  const data = ref<Tree[]>([])

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

  onMounted(async () => {
    if (!srcCanvas.value)
      return

    // const tParent = targetCanvas.value.parentElement
    // targetCanvas.value.width = tParent?.clientWidth || 0
    // targetCanvas.value.height = tParent?.clientHeight || 0

    const p = createPainter({
      debug: import.meta.env.DEV,
      view: srcCanvas.value,
      size: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    })

    // v8: Application is async-init — must `await init()` before using the painter.
    // Expose it reactively only once ready, otherwise UI (which reads e.g.
    // `painter.background`) renders against an uninitialised renderer.
    await p.init()
    await p.loadImage('https://pixijs.com/assets/flowerTop.png')

    const tCanvas = targetCanvas.value
    if (tCanvas) {
      tCanvas.width = tCanvas.parentElement?.clientWidth || 0
      tCanvas.height = tCanvas.parentElement?.clientHeight || 0
    }

    const canvasContainer = p.canvas.container
    data.value = getLayersData(canvasContainer)
    p.emitter.on('history:record', async () => {
      data.value = getLayersData(canvasContainer)

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
    })

    // expose only after fully initialised
    painter.value = p
  })

  return {
    srcCanvas,
    targetCanvas,
    painter,
    data,

    onExtract,
  }
}
