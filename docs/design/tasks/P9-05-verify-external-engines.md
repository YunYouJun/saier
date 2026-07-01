---
title: P9-05 · Verify external engines
---

# P9-05 · 外部引擎验收

- **Phase / ID**: P9-05
- **Depends on**: P9-01、P9-04
- **Files**: `packages/core/test/`、`packages/saier/test/`、`packages/vue/test/`
- **Effort**: M

## Context

P9 的验收不是“接了某个特定引擎”，而是证明 engine 插槽不会破坏 core / pixi / vue 的边界。

**已落地（2026-07-01）**：core 单测覆盖 fake external engine registry 正反例、async adapter、`.myb` 映射；browser 集成测试覆盖 `createPainter({ brushEngines, brushPresets })` 画入 surface；Vue 测试覆盖未注册 external preset 禁用。真实 WASM / `.myb` parity 是后续 experimental，不阻塞 P9。

## Steps

1. fake external engine：实现 `BrushEngine`，输出可预测 dab。
2. browser 集成：注册 preset + engine，画一笔，extract 像素非空。
3. 负例：未注册 engine 的 preset 不可选 / 创建时报错。

## Acceptance

- [x] fake external engine 在 core 单测与 browser 集成中都可用。
- [x] 未注册 engine 不会污染默认 preset，也不会静默降级。

## Out of scope

- libmypaint golden parity。
