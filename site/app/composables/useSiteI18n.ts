import type { BlendMode, BuiltinBrushPresetId, MemoryRiskLevel } from '@saier/core'
import { computed, shallowRef } from 'vue'

export type SiteLocale = 'en' | 'zh'

interface SiteMessages {
  appName: string
  tagline: string
  language: string
  exportPreview: string
  closePreview: string
  loading: string
  menu: {
    file: string
    newCanvas: string
    importImage: string
    exportPreview: string
    download: string
    edit: string
    undo: string
    redo: string
    view: string
    zoomIn: string
    zoomOut: string
    language: string
    tools: string
    brush: string
    eraser: string
    pan: string
    image: string
    selection: string
    layers: string
    addLayer: string
    showActiveLayer: string
    moveActiveLayerUp: string
    moveActiveLayerDown: string
    removeActiveLayer: string
    english: string
    chinese: string
  }
  status: {
    ready: string
    tool: string
    layer: string
    noLayer: string
  }
  controls: {
    backgroundColor: string
    brush: string
    colorPicker: string
    eraser: string
    foregroundColor: string
    hex: string
    hue: string
    image: string
    palette: string
    selection: string
    saturation: string
    value: string
    clear: string
    zoomIn: string
    zoomOut: string
    extract: string
    download: string
    undo: string
    redo: string
  }
  brushOptions: {
    pressure: string
    size: string
    opacity: string
    spacing: string
    hardness: string
    flow: string
    presetLabels: Record<BuiltinBrushPresetId, string>
  }
  memory: {
    browser: string
    diagnostics: string
    estimated: string
    event: string
    input: string
    inputDevice: string
    inputDrawing: string
    inputNo: string
    inputPressure: string
    inputSamples: string
    inputTilt: string
    inputYes: string
    status: string
    surface: string
    total: string
    undo: string
    unavailable: string
    risk: Record<MemoryRiskLevel, string>
  }
  documents: {
    tabs: string
    newCanvas: string
    closeDocument: string
    title: string
    name: string
    width: string
    height: string
    preset: string
    custom: string
    create: string
    cancel: string
    size: string
    invalidSize: string
    defaultName: string
    presets: {
      square512: string
      square1024: string
      hd: string
      portrait: string
      a4: string
      large4096: string
    }
  }
  layers: {
    title: string
    addLayer: string
    hideLayer: string
    showLayer: string
    moveUp: string
    moveDown: string
    removeLayer: string
    defaultLayerName: string
    blendModes: Record<BlendMode, string>
  }
}

const STORAGE_KEY = 'saier:locale'

const messages: Record<SiteLocale, SiteMessages> = {
  en: {
    appName: 'Saier',
    tagline: 'Online painting workspace',
    language: 'Language',
    exportPreview: 'Export preview',
    closePreview: 'Close preview',
    loading: 'Loading painter...',
    menu: {
      file: 'File',
      newCanvas: 'New canvas',
      importImage: 'Import image',
      exportPreview: 'Preview export',
      download: 'Download PNG',
      edit: 'Edit',
      undo: 'Undo',
      redo: 'Redo',
      view: 'View',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      language: 'Language',
      tools: 'Tools',
      brush: 'Brush',
      eraser: 'Eraser',
      pan: 'Pan',
      image: 'Image',
      selection: 'Selection',
      layers: 'Layers',
      addLayer: 'New layer',
      showActiveLayer: 'Show active layer',
      moveActiveLayerUp: 'Move active layer up',
      moveActiveLayerDown: 'Move active layer down',
      removeActiveLayer: 'Delete active layer',
      english: 'English',
      chinese: 'Chinese',
    },
    status: {
      ready: 'Ready',
      tool: 'Tool',
      layer: 'Layer',
      noLayer: 'No layer',
    },
    controls: {
      backgroundColor: 'Background color',
      brush: 'Brush',
      colorPicker: 'Color picker',
      eraser: 'Eraser',
      foregroundColor: 'Brush color',
      hex: 'Hex',
      hue: 'Hue',
      image: 'Import image',
      palette: 'Palette',
      selection: 'Selection',
      saturation: 'Saturation',
      value: 'Value',
      clear: 'Clear',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      extract: 'Preview export',
      download: 'Download',
      undo: 'Undo',
      redo: 'Redo',
    },
    brushOptions: {
      pressure: 'Pressure',
      size: 'Size',
      opacity: 'Opacity',
      spacing: 'Spacing',
      hardness: 'Hard',
      flow: 'Flow',
      presetLabels: {
        pen: 'Pen',
        pencil: 'Pencil',
        marker: 'Marker',
        airbrush: 'Airbrush',
        calligraphy: 'Calligraphy',
      },
    },
    memory: {
      browser: 'Browser',
      diagnostics: 'Diagnostics',
      estimated: 'estimated',
      event: 'Event',
      input: 'Input',
      inputDevice: 'Device',
      inputDrawing: 'Drawing',
      inputNo: 'No',
      inputPressure: 'Pressure',
      inputSamples: 'Samples / coalesced',
      inputTilt: 'Tilt / twist',
      inputYes: 'Yes',
      status: 'Memory',
      surface: 'Surface',
      total: 'Estimated',
      undo: 'Undo',
      unavailable: 'Unavailable',
      risk: {
        normal: 'Normal',
        watch: 'Watch',
        high: 'High',
      },
    },
    documents: {
      tabs: 'Files',
      newCanvas: 'New canvas',
      closeDocument: 'Close file',
      title: 'New canvas',
      name: 'Name',
      width: 'Width',
      height: 'Height',
      preset: 'Preset',
      custom: 'Custom',
      create: 'Create',
      cancel: 'Cancel',
      size: 'Size',
      invalidSize: 'Use whole pixels from 64 to 8192.',
      defaultName: 'Canvas',
      presets: {
        square512: 'Square 512',
        square1024: 'Square 1024',
        hd: 'HD 16:9',
        portrait: 'Portrait 9:16',
        a4: 'A4 300dpi',
        large4096: 'Large 4096',
      },
    },
    layers: {
      title: 'Layers',
      addLayer: 'Add layer',
      hideLayer: 'Hide layer',
      showLayer: 'Show layer',
      moveUp: 'Move up',
      moveDown: 'Move down',
      removeLayer: 'Remove layer',
      defaultLayerName: 'Layer',
      blendModes: {
        normal: 'Normal',
        multiply: 'Multiply',
        screen: 'Screen',
        overlay: 'Overlay',
        darken: 'Darken',
        lighten: 'Lighten',
        add: 'Add',
      },
    },
  },
  zh: {
    appName: '赛尔画板',
    tagline: '在线绘画工作台',
    language: '语言',
    exportPreview: '导出预览',
    closePreview: '关闭预览',
    loading: '画板加载中...',
    menu: {
      file: '文件',
      newCanvas: '新建画布',
      importImage: '导入图片',
      exportPreview: '预览导出',
      download: '下载 PNG',
      edit: '编辑',
      undo: '撤销',
      redo: '重做',
      view: '视图',
      zoomIn: '放大',
      zoomOut: '缩小',
      language: '语言',
      tools: '工具',
      brush: '画笔',
      eraser: '橡皮擦',
      pan: '平移',
      image: '图片',
      selection: '选择',
      layers: '图层',
      addLayer: '新建图层',
      showActiveLayer: '显示当前图层',
      moveActiveLayerUp: '当前图层上移',
      moveActiveLayerDown: '当前图层下移',
      removeActiveLayer: '删除当前图层',
      english: 'English',
      chinese: '中文',
    },
    status: {
      ready: '就绪',
      tool: '工具',
      layer: '图层',
      noLayer: '无图层',
    },
    controls: {
      backgroundColor: '背景色',
      brush: '画笔',
      colorPicker: '颜色选择器',
      eraser: '橡皮擦',
      foregroundColor: '画笔颜色',
      hex: 'Hex',
      hue: '色相',
      image: '导入图片',
      palette: '色板',
      selection: '选择',
      saturation: '饱和度',
      value: '明度',
      clear: '清空',
      zoomIn: '放大',
      zoomOut: '缩小',
      extract: '预览导出',
      download: '下载',
      undo: '撤销',
      redo: '重做',
    },
    brushOptions: {
      pressure: '压感',
      size: '大小',
      opacity: '不透明度',
      spacing: '间距',
      hardness: '硬度',
      flow: '流量',
      presetLabels: {
        pen: '钢笔',
        pencil: '铅笔',
        marker: '马克笔',
        airbrush: '喷枪',
        calligraphy: '书法',
      },
    },
    memory: {
      browser: '浏览器',
      diagnostics: '诊断',
      estimated: '估算',
      event: '事件',
      input: '输入',
      inputDevice: '设备',
      inputDrawing: '绘制中',
      inputNo: '否',
      inputPressure: '压感',
      inputSamples: '采样 / 合并',
      inputTilt: '倾斜 / 旋转',
      inputYes: '是',
      status: '内存',
      surface: '画布资源',
      total: '估算',
      undo: '撤销',
      unavailable: '不可用',
      risk: {
        normal: '正常',
        watch: '关注',
        high: '高',
      },
    },
    documents: {
      tabs: '文件',
      newCanvas: '新建画布',
      closeDocument: '关闭文件',
      title: '新建画布',
      name: '名称',
      width: '宽度',
      height: '高度',
      preset: '预设',
      custom: '自定义',
      create: '创建',
      cancel: '取消',
      size: '尺寸',
      invalidSize: '请输入 64 到 8192 的整数像素。',
      defaultName: '画布',
      presets: {
        square512: '方形 512',
        square1024: '方形 1024',
        hd: '横屏 16:9',
        portrait: '竖屏 9:16',
        a4: 'A4 300dpi',
        large4096: '大画布 4096',
      },
    },
    layers: {
      title: '图层',
      addLayer: '新建图层',
      hideLayer: '隐藏图层',
      showLayer: '显示图层',
      moveUp: '上移',
      moveDown: '下移',
      removeLayer: '删除图层',
      defaultLayerName: '图层',
      blendModes: {
        normal: '正常',
        multiply: '正片叠底',
        screen: '滤色',
        overlay: '叠加',
        darken: '变暗',
        lighten: '变亮',
        add: '添加',
      },
    },
  },
}

const locale = shallowRef<SiteLocale>('zh')
let isInitialized = false

export function useSiteI18n() {
  if (import.meta.client && !isInitialized) {
    isInitialized = true
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isSiteLocale(stored))
      locale.value = stored
    else if (!navigator.language.toLowerCase().startsWith('zh'))
      locale.value = 'en'
  }

  const text = computed(() => messages[locale.value])
  const htmlLang = computed(() => locale.value === 'zh' ? 'zh-CN' : 'en')
  const nextLocaleLabel = computed(() => locale.value === 'zh' ? 'English' : '中文')

  function setLocale(value: SiteLocale): void {
    locale.value = value
    if (import.meta.client)
      window.localStorage.setItem(STORAGE_KEY, value)
  }

  function toggleLocale(): void {
    setLocale(locale.value === 'zh' ? 'en' : 'zh')
  }

  return {
    htmlLang,
    locale,
    nextLocaleLabel,
    setLocale,
    text,
    toggleLocale,
  }
}

function isSiteLocale(value: string | null): value is SiteLocale {
  return value === 'en' || value === 'zh'
}
