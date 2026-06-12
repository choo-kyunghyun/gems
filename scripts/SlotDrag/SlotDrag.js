/**
 * SlotDrag — shared drag-and-drop state for UISlots grids, a standalone static
 * singleton (NOT a UIComponent), drawn on top like Tooltip/Toast. A draggable
 * UISlots calls `SlotDrag.begin(grid, i)` on press over a filled slot (picks the
 * item up — the source slot goes empty) and `SlotDrag.drop(grid, j)` when the
 * pointer is released over a slot (places the carried item there, swapping any
 * existing item back to the source). Because grids only see the release when the
 * pointer is over one of their slots, the "released over nothing" case is caught in
 * `SlotDrag.draw()` (runs every frame in Draw_75): if a drag is active but the
 * button is up and nobody dropped it, the item is returned to its source. This is
 * also what draws the floating icon that follows the cursor.
 *
 * GMRT note: state is read live each frame; no cached primitive bool, no timer.
 */
globalThis.SlotDrag = class SlotDrag {
  static active = false;
  static source = null; // the UISlots the item came from
  static sourceIndex = -1;
  static item = null; // the carried slot item
  static iconSize = 48;

  static begin(grid, i) {
    if (SlotDrag.active) return;
    const it = grid.items[i];
    if (it == null) return;
    SlotDrag.active = true;
    SlotDrag.source = grid;
    SlotDrag.sourceIndex = i;
    SlotDrag.item = it;
    grid.items[i] = null; // pick up — source slot shows empty while dragging
  }

  // Place the carried item into grid[j], swapping whatever was there back to the
  // source slot (null if it was empty → a plain move).
  static drop(grid, j) {
    if (!SlotDrag.active) return;
    const target = grid.items[j];
    grid.items[j] = SlotDrag.item;
    SlotDrag.source.items[SlotDrag.sourceIndex] = target;
    SlotDrag._reset();
  }

  static cancel() {
    if (!SlotDrag.active) return;
    SlotDrag.source.items[SlotDrag.sourceIndex] = SlotDrag.item;
    SlotDrag._reset();
  }

  static _reset() {
    SlotDrag.active = false;
    SlotDrag.source = null;
    SlotDrag.sourceIndex = -1;
    SlotDrag.item = null;
  }

  static draw() {
    if (!SlotDrag.active) return;

    // Button up but no slot claimed the drop this release → return to source.
    if (!mouse_check_button(mb_left)) {
      SlotDrag.cancel();
      return;
    }

    const it = SlotDrag.item;
    if (it == null || it.sprite == null || !sprite_exists(it.sprite)) return;

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const sz = SlotDrag.iconSize;
    const n = max(1, sprite_get_number(it.sprite));
    const sub = clamp(it.subimg ?? 0, 0, n - 1);
    draw_sprite_stretched_ext(
      it.sprite,
      sub,
      mx - sz * 0.5,
      my - sz * 0.5,
      sz,
      sz,
      it.color ?? c_white,
      0.85,
    );
  }
};
