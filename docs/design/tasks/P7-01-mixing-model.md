---
title: P7-01 · 混色 / 沉积模型（types + preset + controller）
---

# P7-01 · 混色 / 沉积模型：先把参数与状态接好，不动像素

- **Phase / ID**: P7 / P7-01
- **Depends on**: P4-01（`BrushPreset`）、P2-02（CPU 光栅器 = 混色的落点）
- **Files**: `packages/core/src/types/brush.ts`、`packages/core/src/brush/BrushPreset.ts`、`packages/core/src/controller/PainterController.ts`、`packages/core/src/types/index.ts`、`packages/core/test/`
- **Effort**: M

## Context

P7 是「绘画的灵魂」——混色 / smudge / 水彩。与 [P6-01](./P6-01-layer-attributes-model) 同样的策略：**先一次性接好模型与参数**，后续每张卡只落各自的像素 / 引擎逻辑，避免反复改契约。

P7 的新参数（对齐 Krita color smudge brush / MyPaint）：

- **density（paint amount / 浓度）**：单 dab 沉积不透明度的累积强度。
- **dilution（稀释 / wetness）**：降低沉积 alpha，让颜料变薄、与底色融合（水彩）。
- **persistence（smudge length / 留色）**：smudge 颜色桶的记忆系数，决定颜色被拖多远。
- **smudge（pickup / 取色量）**：每 dab 从画布取色的比例。
- **colorAmount（自色比例）**：沉积色在「取到的色 ↔ 笔刷本色」之间的插值。
- **wetEdge（湿边）**：水彩描边边缘的颜料堆积（[P7-05](./P7-05-watercolor-dilution-wetedge) 落地，这里只放开关字段）。
- **paperTextureId（纸纹）**：调制 dab 覆盖的灰度纹理 id（[P7-06](./P7-06-paper-texture) 落地）。
- **edgeSoftness（边缘软度）**：复用现有 `hardness`，必要时由 [P7-02](./P7-02-stamp-deposit-kernel) 补更细的边缘核。

> ⚠️ 取色（smudge / colorAmount）需要**读回画布像素**，不能只靠 `BrushEngine`（其契约「只产 dab，不知后端」）。读回路径见 [D10](../decisions#d10) 与 [P7-03](./P7-03-surface-sampler)；本卡只放**参数与状态**，不实现取色。

## Steps

1. **类型**：`BrushDab` 增补沉积相关可选字段（`density?` / `dilution?`，以及供 P7-06 的 `paperTextureId?`）。全部可选、默认等价当前行为，保持向后兼容。
2. **预设**：`BrushPreset` 增补 P7 参数块（`smudge?` / `colorAmount?` / `dilution?` / `persistence?` / `wetEdge?` / `density?` / `paperTextureId?`）；`BrushPresetEngine` 增加 `'smudge'` 取值（引擎实现留 [P7-04](./P7-04-smudge-engine)，本卡只占位 + factory 抛「未实现」直到 P7-04）。
3. **controller**：`PainterBrushState` 镜像新参数；`PainterController.brush` 增 setter（`setSmudge` / `setDilution` / `setPersistence` / `setColorAmount` / `setDensity` …），走现有 `emitBrushChange` 路径发 `brush:change`，供 UI 薄皮订阅（[D7](../decisions#d7)）。
4. 单测：参数 `normalize` / `clamp01` 往返；`clonePreset` 深拷新字段；controller setter 触发 `brush:change` 且 `getState()` 为不可变快照。

## Acceptance

- [ ] 新参数在 types / preset / controller 三处贯通；默认值**不改变**现有笔刷行为（既有 golden / 像素断言全绿）。
- [ ] controller setter 改参数即发 `brush:change`，`getState()` 返回防御性快照。
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 绿。

## Out of scope

- 任何像素 / 取色 / 引擎逻辑（P7-02..06）；UI 控件（[P7-07](./P7-07-presets-and-ui)）。
