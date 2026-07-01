# saier

[![NPM](https://img.shields.io/npm/v/saier.svg?style=flat-square)](https://www.npmjs.com/package/saier)

🎨 An elegant online painting runtime powered by PixiJS, with a Pixi-agnostic raster engine underneath.

Use `saier` for the default painter runtime, `@saier/core` for the headless raster engine, `@saier/pixi` for PixiJS backends, and `@saier/vue` for reusable Vue controls.

## Links

|                   | URL                                   |
| ----------------- | ------------------------------------- |
| 🖼️ **App / Demo** | <https://saier.yunle.fun>             |
| 📖 **Docs**       | <https://docs.saier.yunle.fun>        |
| 📦 **npm**        | <https://www.npmjs.com/package/saier> |

> Both sites are deployed on Cloudflare Pages (connected to this GitHub repo).
> `site/` (Nuxt app) → App / Demo · `docs/` (VitePress) → Docs.

## Documentation

- **Guide & Design docs**: <https://docs.saier.yunle.fun> — or run `pnpm docs:dev` (VitePress site under [`docs/`](./docs))
- **Architecture roadmap** (for contributors / coding agents): [`docs/design/`](./docs/design/index.md) — the phased plan (P0–P9) to evolve saier into a Pixi-agnostic raster painting runtime. See also [`AGENTS.md`](./AGENTS.md).
- **Custom brushes**: [`docs/guide/custom-brushes.md`](./docs/guide/custom-brushes.md) covers runtime custom presets, external engine registration, and `.myb` preset mapping.

## Legacy package name

`pixi-painter` is the previous npm package name. New integrations should install `saier`; the release plan keeps `pixi-painter` only as a deprecated compatibility alias.

## Usage

```bash
pnpm add saier
```

### TypeScript

```ts
import { createPainter } from 'saier'

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
pnpm dev      # final site experience
pnpm dev:vue  # lightweight Vue example sandbox
```

## License

MPL-2.0 ❤ [YunYouJun](https://github.com/YunYouJun)
