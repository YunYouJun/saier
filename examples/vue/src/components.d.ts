/* eslint-disable */
import type { DefineComponent } from 'vue'
import type { RouterLink, RouterView } from 'vue-router'

export {}

type GlobalComponent = DefineComponent

declare module 'vue' {
  export interface GlobalComponents {
    AGUICheckbox: GlobalComponent
    AGUIForm: GlobalComponent
    AGUIFormItem: GlobalComponent
    AGUIInput: GlobalComponent
    AGUIInputNumber: GlobalComponent
    AGUIPanel: GlobalComponent
    AGUISlider: GlobalComponent
    AGUITree: GlobalComponent
    Logos: typeof import('./components/Logos.vue')['default']
    PainterColorPicker: typeof import('./../../../packages/vue/components/PainterColorPicker.vue')['default']
    PainterControls: typeof import('./../../../packages/vue/components/PainterControls.vue')['default']
    PainterIconButton: typeof import('./../../../packages/vue/components/PainterIconButton.vue')['default']
    PainterNavigator: typeof import('./../../../packages/vue/components/PainterNavigator.vue')['default']
    PainterOptionsBar: typeof import('./../../../packages/vue/components/PainterOptionsBar.vue')['default']
    PixiPainterAI: typeof import('./components/PixiPainterAI.vue')['default']
    PixiPainterApp: typeof import('./components/PixiPainterApp.vue')['default']
    RouterLink: typeof RouterLink
    RouterView: typeof RouterView
  }
}
