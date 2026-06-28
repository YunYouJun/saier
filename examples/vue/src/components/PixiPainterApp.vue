<script lang="ts" setup>
import { modalOptions, usePixiPainter } from '../composables'

const {
  activeLayerId,
  data,
  layerActions,
  layerThumbnails,
  layers,
  onExtract,
  painter,
  srcCanvas,
  targetCanvas,
} = usePixiPainter()
void srcCanvas
void targetCanvas
</script>

<template>
  <div relative h-screen w-screen overflow="hidden">
    <template v-if="painter">
      <PainterControls :painter="painter" class="absolute left-2 top-13" @extract="onExtract" />
      <PainterOptionsBar :painter="painter" class="absolute left-2 top-2" />
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

    <div class="absolute right-2 top-120 w-80 text-left">
      <AGUITree :data="data" />
    </div>

    <div h-full w-full text-center shadow>
      <canvas ref="srcCanvas" class="m-auto h-full w-full rounded" />
    </div>

    <div class="absolute bottom-0 right-0 h-80 w-80 rounded" bg-gray>
      <canvas id="target-canvas" ref="targetCanvas" />
    </div>

    <AGUIPanel class="absolute bottom-2 left-0 w-72">
      <AGUIForm>
        <AGUIFormItem label="Prompt">
          <AGUIInput v-model="modalOptions.prompt" class="w-full" />
        </AGUIFormItem>
        <AGUIFormItem label="Num Iterations">
          <AGUIInputNumber v-model="modalOptions.num_iterations" class="w-full" :min="1" :max="100" :step="1" />
        </AGUIFormItem>
      </AGUIForm>
    </AGUIPanel>
  </div>
</template>
