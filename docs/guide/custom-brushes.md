---
title: Custom Brushes
---

# Custom Brushes

Saier supports runtime custom brush presets. A preset is data: engine id, tip id, size, opacity, spacing, hardness, mixing parameters, tags, and display metadata. The host app decides where to store that data.

## Save Current Settings

Use `painter.brush.createCustomPreset()` to snapshot the current brush controls into a custom preset and select it immediately.

```ts
import { createPainter } from 'saier'

const painter = createPainter({
  view: document.querySelector('canvas') as HTMLCanvasElement,
  size: { width: 1024, height: 1024 },
})

await painter.init()

painter.brush.setSize(18)
painter.brush.setOpacity(0.72)

const preset = painter.brush.createCustomPreset({
  name: 'Soft sketch',
  group: 'Custom',
})

console.log(preset.id)
```

Custom presets are available for the current painter instance until removed or the page reloads.

```ts
painter.brush.removePreset(preset.id)
```

## Register Preset Data

Use `painter.brush.registerPreset()` when your app already has preset data, for example from localStorage, project metadata, or a server.

```ts
import type { BrushPreset } from '@saier/core'

const savedPreset: BrushPreset = {
  id: 'custom-soft-sketch',
  name: 'Soft sketch',
  group: 'Custom',
  source: 'custom',
  custom: true,
  engine: 'simple',
  tipId: 'round-soft',
  size: 18,
  opacity: 0.72,
  spacing: 0.22,
  hardness: 0.2,
  tags: ['custom'],
}

painter.brush.registerPreset(savedPreset, { select: true })
```

Saier does not persist custom brushes by itself. Persist the returned `BrushPreset` in your host app, then call `registerPreset()` during startup.

## External Brush Engines

External engines register an engine id plus a factory. Presets that point to that id are disabled in UI summaries until the engine is available.

```ts
import type { BrushEngineRegistration, BrushPreset } from '@saier/core'
import { createPainter } from 'saier'

const engine: BrushEngineRegistration = {
  id: 'my-engine',
  label: 'My Engine',
  experimental: true,
  create: ({ preset }) => createMyBrushEngine(preset),
}

const preset: BrushPreset = {
  id: 'my-engine-soft',
  name: 'My engine soft',
  group: 'Experimental',
  source: 'external',
  engine: 'my-engine',
  tipId: 'round-soft',
  size: 24,
  opacity: 0.8,
  spacing: 0.18,
  hardness: 0.4,
}

const painter = createPainter({
  view: document.querySelector('canvas') as HTMLCanvasElement,
  size: { width: 1024, height: 1024 },
  brushEngines: [engine],
  brushPresets: [preset],
})
```

Mark real WASM or third-party engines as `experimental` until their loading, backend requirements, and pixel behavior are verified.

## Import `.myb` Settings

`parseMyPaintBrushPreset()` maps a MyPaint-style `.myb` settings file into a Saier `BrushPreset` draft. It covers core knobs such as radius, opacity, hardness, spacing, smudge, and smudge length; it is not pixel-parity with libmypaint.

```ts
import { parseMyPaintBrushPreset } from '@saier/core'

const mybText = await file.text()
const preset = parseMyPaintBrushPreset(mybText, {
  id: 'mypaint-soft-pencil',
  name: 'Soft Pencil',
})

painter.brush.registerPreset(preset, { select: true })
```

Treat `.myb` import as a compatibility bridge for preset setup, not as a promise that Saier renders exactly like MyPaint.
