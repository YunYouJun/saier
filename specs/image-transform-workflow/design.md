# Image transform workflow design

## Data flow

1. Decode and fit the source image into premultiplied RGBA pixels.
2. Add a normal raster layer to `Document`.
3. Write pixels through the backend's region I/O contract.
4. Keep a Pixi `EditableLayer` as an interaction-only overlay bound to the
   raster layer's `LayerTransform`; it never owns the image pixels.
5. Mirror the active transform into a DOM `PainterTransformBar` for exact input.

## Coordinate model

- Imported pixels are centered inside the document surface.
- The layer anchor is the imported content center in layer-local pixel space.
- `LayerTransform.x/y` are the anchor position in document pixel coordinates.
- The overlay lives in the same document-centered coordinate system as the
  raster display handle.
- Handle geometry is converted from screen pixels by the viewport scale.

## Transaction model

- Selecting a transformable layer opens a transform session and captures its
  baseline transform.
- Pointer, exact-input, flip, and nudge operations update the document live.
- Confirm records one command in the unified painter history.
- Cancel restores the baseline without recording.
- Tool/document/selection changes auto-confirm the previous session.
- Import and imported-image deletion retain the compact imported pixel region so
  undo/redo does not snapshot the entire canvas.

## Boundaries

- `@saier/core` owns layer state and a renderer-agnostic region I/O contract.
- `@saier/pixi` implements region I/O for tile and RenderTexture backends.
- `saier` owns transform-session orchestration and the Pixi overlay.
- `@saier/vue` owns the accessible DOM transform bar.
