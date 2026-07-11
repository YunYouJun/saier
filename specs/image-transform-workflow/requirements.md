# Image transform workflow requirements

## Goal

Imported images behave like first-class raster layers and expose a predictable,
professional transform workflow without screen-space controls shrinking with the
canvas zoom.

## Priorities

### P0 — correctness and document integration

- Import image pixels into a real `Document` raster layer.
- Include imported images in layer state, project serialization, thumbnails, and
  the active-layer model.
- Show transform controls only for the selected transformable layer.
- Treat a free-transform session as one undoable transaction.
- `Escape` cancels the pending transform; `Enter` or double-click confirms it.
- Removing an imported image is undoable and removes its layer and overlay
  together.

### P1 — professional controls

- Keep visible handles and hit targets in screen pixels across viewport zoom.
- Provide explicit hit areas and larger coarse-pointer targets.
- Provide exact X/Y/W/H/rotation editing, aspect lock, horizontal/vertical flip,
  confirm, cancel, and delete in a DOM transform bar.
- Keep destructive controls out of the canvas bounding box.

### P2 — polish and accessibility

- Support arrow-key nudging (1 px, Shift = 10 px), Delete/Backspace, Enter, and
  Escape while preserving editable-form behavior.
- Expose meaningful accessibility labels for canvas handles and DOM controls.
- Use a dual-contrast transform outline that remains visible on light and dark
  artwork.

## Acceptance

- Importing an image adds a real raster layer whose pixels survive project
  export/import.
- Transforming at non-1x viewport zoom keeps handle size stable and applies the
  expected document-space transform.
- Only the active transformable layer shows controls.
- Confirm/cancel/undo/redo/delete/restore round-trip layer pixels and transform.
- Exact controls and keyboard interactions update the same core document state.
- Browser tests cover mouse, zoom, keyboard, serialization, and rendered UI.
