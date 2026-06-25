---
title: P0-06 · 测试地基（vitest + 像素断言）
---

# P0-06 · 测试地基：vitest + headless 像素断言

- **Phase / ID**: P0 / P0-06
- **Depends on**: P0-02
- **Files**: `test/`（重建）、`packages/pixi-painter`（可能加 `test/`）、根 `vitest` 配置
- **Effort**: M

## Context

仓库刚删掉 `test/basic.test.ts`，目前无测试地基。后续每个阶段的「验收」都要落到自动化测试，所以这张卡建立**第一个可跑的像素断言**，作为模板。根 `package.json` 已有 `"test": "vitest"`。

> WebGL 在纯 node 下不可用。优先用浏览器环境跑：`@vitest/browser`（playwright provider）或 jsdom + `pixi.js` 的 headless。**推荐 `@vitest/browser` + playwright**，最贴近真实渲染。

## Steps

1. 选环境：加 `@vitest/browser` + `playwright`（或团队已有方案）。配置 `vitest.config.ts`（browser.enabled、headless、provider: 'playwright'）。
2. 写第一个测试 `test/brush.spec.ts`：
   - 建一个离屏 `<canvas>`，`createPainter({ view, size })` + `await painter.init()`。
   - 程序化触发一条直线笔迹（直接调用 brush 的 pointer 流程，或派发合成 `pointerdown/move/up`）。
   - `await painter.extractCanvas('pixels')` → 断言：存在非背景像素；其包围盒落在预期区域。
3. 加一个**确定性**占位：同样输入跑两次，像素哈希一致（为 P3 的回放测试铺路）。
4. 文档化：在 `test/README.md` 写「如何加一个像素 golden 测试」（截图存基准 PNG + 阈值比对），供后续阶段复制。

## Acceptance

- [ ] `pnpm test` 在 CI/本地可跑且绿。
- [ ] `test/brush.spec.ts`：画线后 `extract pixels` 非空 + 包围盒断言通过。
- [ ] 同输入两次像素哈希一致（确定性占位）。
- [ ] `test/README.md` 给出 golden 测试写法。

## Out of scope

- 覆盖全部工具的 golden 基线（随各阶段增量补）。
