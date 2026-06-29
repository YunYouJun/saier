---
title: P7-06 · 纸纹（paper texture）调制
---

# P7-06 · 纸纹：灰度纹理调制 dab 覆盖

- **Phase / ID**: P7 / P7-06
- **Depends on**: P7-02（沉积内核）
- **Files**: `packages/core/src/surface/rasterizer.ts`、`packages/core/src/brush/paper.ts`（新）、`packages/core/src/brush/tips.ts`、`packages/core/test/`
- **Effort**: M

## Context

纸纹 = 一张**可平铺的灰度高度 / 颗粒纹理**，按文档坐标采样后调制 dab 的有效覆盖，让笔迹呈现纸张颗粒感（铅笔 / 粉彩 / 干笔尤其明显）。Roadmap 验收：「纸纹可开关」。纸纹按**文档空间**对齐（[D2](../decisions#d2)），与缩放解耦、笔笔咬合同一张纸。

复用思路：与 `tips.ts` 的 `sampleBrushTipAlpha`（笔尖 mask）正交——笔尖决定 dab 形状，纸纹按落点的文档坐标再乘一层颗粒系数。

## Steps

1. **纹理源**：`paper.ts` 提供少量内置程序化纸纹（确定性、seeded 程序生成或固定小图平铺），按 `paperTextureId` 注册，`samplePaper(textureId, docX, docY): number`（0..1）。
2. **调制**：`rasterizeDab` 在算出 `coverage` 后，若 dab 有 `paperTextureId`，乘以 `samplePaper(id, x, y)`；`strength`（纸纹强度）可由预设控制，0 = 关闭等价旧行为。
3. **文档空间对齐**：纸纹按 `(docX, docY)` 取样（不随 zoom / dab 局部坐标漂移），保证同一区域重复涂抹颗粒咬合。
4. 单测（node）：① 开纸纹后 dab 覆盖出现按文档坐标稳定的明暗颗粒；② 同位置二次涂抹颗粒位置一致（文档空间锚定）；③ strength=0 与无纹理像素一致；④ 确定性。

## Acceptance

- [ ] 纸纹可开关，开启时笔迹出现稳定颗粒、关闭时等价旧行为。
- [ ] 纸纹按文档空间锚定（缩放 / 重复涂抹咬合），确定性。

## Out of scope

- 用户自定义上传纸纹（后续）；纸纹参与取色 / 湿边的物理耦合（本卡仅调制覆盖）；UI（P7-07）。
