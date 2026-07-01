# Getting Started

## Use the library

### Install

```bash
pnpm add saier
```

`saier` ships ESM and lists `pixi.js` as a dependency. The previous `pixi-painter` package name is kept only as a deprecated compatibility alias; new projects should install `saier`.

### Create a painter

```ts
import { createPainter } from 'saier'

const painter = createPainter({
  // PIXI.Application view
  view: document.querySelector('#canvas') as HTMLCanvasElement,
  // document size
  size: { width: 768, height: 768 },
  // inner board (drawable) size
  boardSize: { width: 512, height: 512 },
})

await painter.init()

// tools: 'brush' | 'eraser' | 'drag' | 'selection' | 'image'
painter.useTool('brush')

// undo / redo
painter.history.undo()
painter.history.redo()
```

See the [`examples/`](https://github.com/YunYouJun/saier/tree/main/examples)
directory for full Vue and React integrations.

## Develop this repo

### Prerequisites

- Node.js >= 18
- pnpm (this repo pins `pnpm@10`)

### Install & run

```bash
git clone https://github.com/YunYouJun/saier.git
cd saier
pnpm install

# run the Nuxt site (default final experience)
pnpm dev

# run the Nuxt site (landing + interactive demos, e.g. /shodo)
pnpm dev:site

# run the lightweight Vue example sandbox
pnpm dev:vue

# run this documentation site
pnpm docs:dev
```

### Repository layout

```
saier/
├── docs/                  # this VitePress documentation site
│   ├── guide/             # usage guide
│   └── design/            # architecture & execution roadmap (for codex)
├── packages/
│   ├── saier/             # main library (umbrella; re-exports core + pixi)
│   ├── core/              # @saier/core — Pixi-agnostic engine
│   ├── pixi/              # @saier/pixi — Pixi backends
│   ├── vue/               # @saier/vue — Vue UI
│   └── shodo/             # @saier/shodo — calligraphy stroke engine
├── examples/              # vue / react integration examples
├── site/                  # Nuxt landing + interactive demo site
├── AGENTS.md / CLAUDE.md  # instructions for coding agents
└── pnpm-workspace.yaml
```

### Common scripts

```bash
pnpm build        # build library + site
pnpm build:lib    # build packages/saier only
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest
pnpm docs:dev     # docs dev server
pnpm docs:build   # build docs
```

## Next Steps

- [Design Overview](/design/) — how the architecture is changing and why
- [Roadmap](/design/roadmap) — the ordered plan agents follow
- [Custom Brushes](/guide/custom-brushes) — save runtime presets, register external engines, and import `.myb` settings
