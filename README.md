# pixi-painter

[![NPM](https://img.shields.io/npm/v/pixi-painter.svg?style=flat-square)](https://www.npmjs.com/package/pixi-painter)

🎨 Painter canvas based on PixiJS.

A library for building drawing scene.

- Demo: <https://pixi-painter.pages.dev/>

## Documentation

- **Guide & Design docs**: run `pnpm docs:dev` (VitePress site under [`docs/`](./docs))
- **Architecture roadmap** (for contributors / coding agents): [`docs/design/`](./docs/design/index.md) — the phased plan (P0–P9) to evolve pixi-painter into a Pixi-agnostic raster painting runtime. See also [`AGENTS.md`](./AGENTS.md).

## Usage

```bash
pnpm add pixi-painter
```

### TypeScript

```ts
import { createPainter } from 'pixi-painter'

const painter = createPainter({
  // PIXI.Application view
  view: document.querySelector('#canvas') as HTMLCanvasElement,
  size: { width: 800, height: 600 },
})

await painter.init()
painter.useTool('brush')
```

## Development

```bash
pnpm i
pnpm dev
```

## License

MPL-2.0 ❤ [YunYouJun](https://github.com/YunYouJun)
