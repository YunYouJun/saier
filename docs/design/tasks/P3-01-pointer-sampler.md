---
title: P3-01 · PointerSampler + coalesced events
---

# P3-01 · `@saier/core`：PointerSampler（coalesced events + 压感归一）

- **Phase / ID**: P3 / P3-01
- **Depends on**: P1-02（`BrushInputPoint` 类型）；viewport `toDocument`（[interfaces · 坐标](../interfaces#坐标与变换正确性)）
- **Files**: `packages/core/src/input/PointerSampler.ts`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成（coalesced sampler + pressure provenance；已接入主 `saier` runtime 的 DOM pointer 热路径）

## Context

把原始 pointer 事件采成干净的 [`BrushInputPoint`](../interfaces#输入-input) 流。绘画要尽量吃到 `getCoalescedEvents()` 的更密原始点（[D6](../decisions#d6)），并把 pressure 归一——**鼠标无压感不要硬塞 0.5**，由策略决定（见 [P3-03](./P3-03-pressure-dynamics)）。

## Steps

1. DOM 层监听 `pointerdown/move/up`（在 canvas 元素上），`pointermove` 用 `event.getCoalescedEvents()` 展开成多个点。
2. 每个点 → `BrushInputPoint`：`x/y` 经 `viewport.toDocument()` 落到 **document space**（[D2](../decisions#d2)）；`pressure`（鼠标 / 无压感设备标记 `hasPressure=false`，原值不伪造）；`tiltX/Y`、`twist`（有则带）；`time = event.timeStamp`（单调）。
3. 输出一个可订阅的点流（emitter 或回调），喂给 Stabilizer（[P3-02](./P3-02-stabilizer)）→ BrushEngine。
4. 与 Pixi federated event 并存（[D6](../decisions#d6)）：federated 作 fallback；DOM 通道作为默认绘画热路径，避免同一事件双重落笔。
5. 运行时输入诊断记录 `pointerType / pressure / tiltX/Y / twist / coalescedCount / sampleCount`，用于验证 Wacom、Apple Pencil、Surface Pen 等标准 Pointer Events 设备。

## Acceptance

- [x] 快速划动时，一次 `pointermove` 能展开出多个 coalesced 点（计数断言 / 真机肉眼）。
- [x] 鼠标输入 `hasPressure=false`，pressure 不被伪造成 0.5（断言）。
- [x] 输出点全在 document space，与缩放无关（缩放后同屏幕路径 → 不同 doc 坐标，正确）。
- [x] `saier` runtime 默认优先使用 DOM pointer path；`input.pointerSource='pixi'` 仍保留旧 Pixi federated fallback。
- [x] 站点开发态 diagnostics 可显示笔设备 `pressure / tilt / twist / coalesced`，用于真机验收。

## Manual pen validation

- Wacom / Surface Pen：落笔时 diagnostics 应显示 `pointerType=pen`，`pressure` 随力度变化，快速划线时 `coalescedCount` 可大于 0（取决于浏览器 / 驱动）。
- 支持倾斜的笔：`tiltX / tiltY` 应随笔杆角度变化；支持 barrel rotation 的设备可观察 `twist`。
- 鼠标：diagnostics 应显示 `pointerType=mouse`，`hasPressure=false`，笔刷使用 velocity / fixed fallback 而不是把浏览器的 0.5 当真实压感。

## Out of scope

- 压感曲线 / 动态（→ P3-03）、平滑（→ P3-02）、手势（→ P3-05）。
