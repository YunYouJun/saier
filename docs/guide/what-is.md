# What is pixi-painter?

`pixi-painter` is a web painting library built on [PixiJS](https://pixijs.com/). It
provides the building blocks of a drawing application — a pannable / zoomable board,
brush and eraser tools, image import with transform handles, selection, and undo / redo.

## Where it is heading

The project is being repositioned from **"a PixiJS brush library"** into:

> **A web painting runtime powered by PixiJS.**

PixiJS stays responsible for what it is great at — viewport, zoom / pan / rotate,
high-DPI display, layer compositing, GPU filters, cursor and selection overlays. The
actual painting data, brushes, layers and undo move into a **Pixi-agnostic raster engine**
(`core`), so the ceiling of the drawing experience is no longer bound by PixiJS
`Graphics`.

If you want to understand the architecture or contribute to the rewrite, start with the
[Design Overview](/design/).

## Packages

| Package                                                                                     | Description                                                                 |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`pixi-painter`](https://github.com/YunYouJun/pixi-painter/tree/main/packages/pixi-painter) | The main library: painter, board, brush, eraser, layers, history            |
| `@saier/vue`                                                                                | Vue UI controls (toolbar / options)                                         |
| `shodo`                                                                                     | Experimental Japanese-calligraphy stroke engine (brush dynamics playground) |

## Features

- 📦 **PixiJS v8** rendering and event system
- 🖌️ Brush & eraser with pointer **pressure** support
- 🧱 Layer & transform handles (scale / rotate / move) for imported images
- ↩️ Undo / redo history
- 🖼️ Image drag-and-drop import
- ⌨️ Keyboard shortcuts

## Next Steps

- [Getting Started](/guide/getting-started) — install and run
- [Design Overview](/design/) — current architecture, target architecture, and why
- [Roadmap](/design/roadmap) — the phased execution plan
