---
title: P9-03 · .myb preset mapping spike
---

# P9-03 · `.myb` preset 映射调研

- **Phase / ID**: P9-03
- **Depends on**: P9-01、P9-02
- **Files**: `docs/design/decisions.md`、`packages/core/src/brush/`
- **Effort**: L

## Context

`.myb` 是 MyPaint 的笔刷预设格式。它不应直接污染 `BrushPreset` 的稳定字段；需要先做参数映射表与不支持项清单。

**已落地（2026-07-01）**：`parseMyPaintBrushPreset()` 支持 JSON 风格 `.myb` 与简化 legacy line 格式，映射 radius / opaque / hardness / spacing / smudge 等核心字段到 `BrushPreset` 草案。

## 最小映射表

| `.myb` setting            | `BrushPreset` 字段            | 说明                                                              |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `radius_logarithmic`      | `size`                        | `size = exp(value) * 2`，再做安全 clamp                           |
| `opaque`                  | `opacity` / `maxOpacity`      | 先映射基础不透明度                                                |
| `hardness`                | `hardness`                    | MyPaint 越大越硬，saier 当前字段按边缘软度使用，取 `1 - hardness` |
| `dabs_per_actual_radius`  | `spacing`                     | 取倒数，映射为半径比例间距                                        |
| `smudge`                  | `engine` / `smudge`           | 大于阈值时映射为 `smudge` 引擎                                    |
| `smudge_length`           | `persistence`                 | 映射拖色桶记忆                                                    |
| pressure / speed mappings | 后续 `MyPaintBrushEngineWasm` | 当前只保留基础 preset 草案                                        |

## Steps

1. 收集 `.myb` 核心参数：radius、opaque、hardness、spacing、smudge、speed / pressure mapping。
2. 建立 `.myb → BrushPreset` 的最小映射表。
3. 标记不能映射或需要外部 engine 才能表达的字段。

## Acceptance

- [x] 有一份映射表说明哪些字段可进入现有 preset，哪些必须交给 `MyPaintBrushEngineWasm`。
- [x] 至少 3 个 `.myb` 样例能解析为 saier preset 草案。

## Out of scope

- 追求 MyPaint 像素级一致。
