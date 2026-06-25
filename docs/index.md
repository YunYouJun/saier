---
layout: home

hero:
  name: "saier"
  text: "优雅的在线画板"
  tagline: 一个体验优雅的在线绘画运行时 —— 融合 SAI / Procreate / Krita 之长，把画意手感搬到 web（PixiJS 显示 + 可脱离 Pixi 的 raster 引擎）
  image:
    src: /favicon.svg
    alt: saier
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Roadmap →
      link: /design/roadmap
    - theme: alt
      text: View on GitHub
      link: https://github.com/YunYouJun/pixi-painter

features:
  - icon: 🎨
    title: PixiJS-powered
    details: Viewport, zoom / pan / rotate, layer compositing and GPU rendering on top of PixiJS v8.
  - icon: 🖌️
    title: Brush · Eraser · Layers
    details: Pressure-aware tools, selection & transform handles, image import, undo / redo.
  - icon: 🧱
    title: Raster-first core (WIP)
    details: Migrating the painting core from Graphics-per-stroke to a swappable raster / tile engine — see the Design section.
  - icon: 📐
    title: Pixi-agnostic engine
    details: Brush, surface, document and undo live in core; PixiJS is just one display backend.
---

## Quick Start

```bash
pnpm add pixi-painter
```

```ts
import { createPainter } from 'pixi-painter'

const painter = createPainter({
  view: document.querySelector('#canvas') as HTMLCanvasElement,
  size: { width: 768, height: 768 },
})

await painter.init()
painter.useTool('brush')
```

## Status

pixi-painter is under active architectural evolution — from a PixiJS brush demo into a
**elegant, multi-inspiration web painting runtime** (synthesizing SAI / Procreate / Krita). The full plan lives in the [Design](/design/) section,
written to be executed phase-by-phase by humans or coding agents.

- 🗺️ [Roadmap (P0–P9)](/design/roadmap) — the ordered execution plan
- 🧩 [Core Interfaces](/design/interfaces) — the contracts between `core` and the Pixi adapter
- 🧭 [Decisions (ADR)](/design/decisions) — key architectural calls and why
