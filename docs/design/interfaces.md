---
title: Core Interfaces
---

# 核心接口契约

> 先定契约，再实现。这些类型是 `core` 与 `pixi` 之间的边界，也是各阶段（[Roadmap](./roadmap)）共享的公共语言。
> 同一套 `BrushEngine` + `Document` + `UndoManager`，配 `RenderTextureBackend`（P1）或 `TiledBackend`（P2）。这就是「不被 Pixi 锁死」的落地形态。

## 输入（input）

```ts
export interface BrushInputPoint {
  x: number // document space
  y: number // document space
  pressure: number // 0..1 normalized；鼠标无压感时由上游决定 fallback（不要硬塞 0.5）
  tiltX?: number
  tiltY?: number
  twist?: number
  time: number // ms，来自 event.timeStamp，单调递增
}
```

## 笔刷（brush）

```ts
export interface RGBA { r: number, g: number, b: number, a: number }

export interface BrushDab {
  x: number
  y: number // document space，dab 中心
  radius: number // document px
  opacity: number // 0..1，单 dab 不透明度（用于累积）
  color: RGBA
  hardness?: number // 边缘软硬
  rotation?: number
  tipId?: string // 戳印笔刷的笔尖纹理 id
}

export interface BrushContext {
  color: RGBA
  baseSize: number // document px
  // 解析后的动态曲线（pressure->size/opacity）、spacing、stabilizer 强度等
}

/** 笔刷只产 dab，不关心落到哪个后端 */
export interface BrushEngine {
  beginStroke: (ctx: BrushContext) => void
  addPoint: (point: BrushInputPoint) => BrushDab[] // 按 spacing 可能产 0..n 个 dab
  endStroke: () => BrushDab[] // 收尾 / 出锋 taper 的补充 dab
}
```

P9 起，`BrushEngine` 实现通过注册表接入，而不是写死在 preset factory 里：

```ts
export interface BrushEngineRegistration {
  id: string
  label?: string
  requiresSurfaceSampler?: boolean
  supportsMixingControls?: boolean
  experimental?: boolean
  create: (context: {
    preset: BrushPreset
    options: BrushEngineFromPresetOptions
  }) => BrushEngine
}
```

未来可有多种实现共存，都满足同一接口：

```
SimpleBrushEngine           // pen / pencil / airbrush / marker
CalligraphyEngine           // 收割 shodo：velocity→粗细、出锋
MyPaintBrushEngineWasm      // P9：libmypaint / Hokusai 风格
ExperimentalWatercolorEngine
```

## 表面后端（surface backend）

```ts
export interface DirtyRect { x: number, y: number, width: number, height: number }
export type CompositeMode = 'normal' | 'erase'

/** undo 单元：P1=区域位图快照；P2=tile patch 数组。结构对 UndoManager 透明 */
export interface StrokePatch {
  layerId: string
  rect: DirtyRect
  before: ImageBitmap | Uint8Array | TilePatch[]
  after: ImageBitmap | Uint8Array | TilePatch[]
}

export interface TilePatch {
  layerId: string
  tileX: number
  tileY: number
  before: Uint8Array
  after: Uint8Array
}

/** core 与 Pixi 之间唯一的像素接口 */
export interface SurfaceBackend {
  readonly width: number
  readonly height: number

  createLayer: (id: string) => void
  removeLayer: (id: string) => void

  beginStroke: (layerId: string) => void
  paintDab: (layerId: string, dab: BrushDab, mode: CompositeMode) => DirtyRect
  endStroke: (layerId: string) => StrokePatch

  applyPatch: (patch: StrokePatch, dir: 'undo' | 'redo') => void

  /** 交给 pixi 显示（Pixi Sprite/Texture 句柄，core 不依赖其类型） */
  getDisplayHandle: (layerId: string) => unknown
}
```

Pixi 侧只需消费 dirty 区域，例如 tile 后端：

```ts
for (const tile of dirtyTiles)
  pixiTileTexture.update(tile.pixelBuffer)
```

## 坐标与变换正确性

> 这是最容易出 bug 的部分，单列。原始建议没提，但实际开发中会反复踩。

1. 输入管线唯一职责：`screen pointer → document point`。封装成 `Viewport.toDocument(screenXY)`，内部吃掉 board 的 `position / scale / rotation`（现有 `canvas/index.ts` 里 `getLocalPosition` 的逻辑迁过来）。
2. **笔刷尺寸是 document px**，渲染时由 backend 自己处理分辨率；缩放画布不改变笔刷的文档尺寸。
3. 图层若自身有 transform（导入图片那种 `EditableLayer`），绘画落点需再经过图层逆变换 → 图层局部像素坐标。**P1 先只支持「未变换的纯绘画图层」**，把带 transform 的图层绘画推迟到 [P6](./roadmap#p6-锁透明-剪贴-蒙版-带-transform-图层绘画)。
4. DPR：document 分辨率与屏幕 DPR 解耦；导出时按 document 分辨率，不受当前 zoom 影响。
5. coalesced events：在 DOM 层 `pointermove` 用 `event.getCoalescedEvents()` 拿到更密的原始点再喂 sampler；Pixi federated event 作为通用路径保留（见 [Decisions · D6](./decisions#d6)）。
