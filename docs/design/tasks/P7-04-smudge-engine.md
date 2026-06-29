---
title: P7-04 · smudge 引擎（取色 + persistence + paint amount）
---

# P7-04 · smudge 引擎：拖动已有颜色

- **Phase / ID**: P7 / P7-04
- **Depends on**: P7-02（沉积内核）、P7-03（`sampleRegion`）
- **Files**: `packages/core/src/brush/SmudgeEngine.ts`（新）、`packages/core/src/brush/BrushPreset.ts`、`packages/core/src/brush/index.ts`、`packages/saier/src/brush/index.ts`、`packages/saier/test/`
- **Effort**: L

## Context

P7 的核心。smudge / color-mixing 笔刷维护一个**颜色桶（smudge bucket）**，沿途取色、留色、再沉积，从而「拖动已有颜色」「两色交界自然过渡」。模型对齐 Krita color smudge / MyPaint：

每个 dab（位置 x,y，半径 r）：

1. **取色**：`S = sampleRegion(layerId, dabRect)`（[P7-03](./P7-03-surface-sampler)）。
2. **留色（persistence `p`）**：`bucket = lerp(S, bucket, p)`——`p` 越大颜色拖得越远。
3. **自色（colorAmount `c`）**：`deposit = lerp(bucket, brushColor, c)`——`c=0` 纯抹（手指 / blender），`c=1` 纯上色。
4. **沉积**：以 `deposit` + density / dilution（P7-02）落 dab。

## 实现要点：取色必须看到「刚落的上一笔」（[D10](../decisions#d10) 已定）

`BrushEngine.addPoint` 一次返回**一批** dab；但 smudge 第 N+1 个 dab 的取色依赖第 N 个 dab **已经画到画布**。若沿用「先收集整批 dab 再统一 paint」，同批内取色读到的是落笔前的旧像素 → 快速描边拖不动色。**业界（MyPaint / Krita / SAI）一律逐 dab 串行,这不是可选项。**

**做法**（[D10](../decisions#d10)）：`SmudgeEngine` 注入一个 `SurfaceSampler`，集成层把绘制循环改为**逐 dab 交错**——`sample → mix → paintDab → 下一颗`（`saier/src/brush` 现在是 `paintDabs(addPoint(point))` 批量；smudge 路径改为单颗即画即采）。引擎仍「只产 dab」、不持后端句柄，采样经注入接口；确定性成立（采样是 surface 状态的纯函数，surface 状态确定演化）。

## Steps

1. **引擎**：实现 `SmudgeEngine implements BrushEngine`（+ `setSampler(sampler)` 注入），按上式维护 `bucket`、读 `persistence` / `smudge` / `colorAmount`；`beginStroke` 初始化桶（建议首点采样初始化，或透明起手，二选一并测）。
2. **集成**：`saier/src/brush` 为 smudge 引擎走逐 dab 交错路径（即画即采），其余笔刷保持批量；smudge 笔迹照常 `beginStroke/endStroke/applyPatch`（bbox/tile undo 复用）。
3. **预设 / factory**：`createBrushEngineFromPreset` 支持 `engine: 'smudge'`；`DEFAULT_BRUSH_PRESETS` 加 `smudge`（纯抹，`colorAmount≈0`）与 `blender` 预设。
4. **后端门控**：smudge 需 `sampleRegion`，tile 后端提供（[P7-00](./P7-00-tile-default-backend) 已让 tile 成为默认，[D11](../decisions#d11)）；显式选 `RenderTexture` 后端时 smudge 禁用（与 [P7-07](./P7-07-presets-and-ui) 协同）。
5. 单测（浏览器真实 WebGL，参照 `clipping-layers.browser.spec.ts`）：① 在红块上用 smudge 划向空白 → 颜色被拖出带状渐隐；② 红 / 蓝交界处划过 → 中间出现自然过渡的紫；③ `persistence` 越大拖痕越长；④ `colorAmount` 越大越接近纯上色；⑤ undo / redo 像素一致；⑥ 同输入确定性。

## Acceptance

- [ ] smudge 能**拖动已有颜色**（拖痕随 persistence 变长）。
- [ ] 两色交界**自然过渡**（边界采样到中间色并沉积）。
- [ ] smudge 描边可独立 undo / redo，像素一致。
- [ ] 取色看到同批内刚落的上一 dab（交错路径生效）；同输入确定性。

## Out of scope

- 湿边 / 纸纹（P7-05 / P7-06）；GPU 后端 smudge（[D11](../decisions#d11)）；UI（P7-07）。
