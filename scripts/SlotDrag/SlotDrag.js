/**
 * SlotDrag — shared drag-and-drop state for UISlots grids, a standalone static
 * singleton (NOT a UIComponent).
 *
 * Flow: a draggable UISlots calls `SlotDrag.begin(grid, i)` on the press edge over a
 * filled slot (picks the item up — the source slot goes empty). Each frame the cursor
 * is over one of its slots it calls `SlotDrag.hover(grid, j)` to record the drop
 * target. `SlotDrag.update()` runs in Step_0 after `UI.update()` and resolves on the
 * release edge: drop onto the last recorded slot, or — if none was ever hovered —
 * restore to source. `SlotDrag.draw()` (Draw_75) renders the carried icon at the
 * cursor. The recorded target is PERSISTED (not cleared when the cursor leaves a
 * slot), so a small drift off the slot as the button comes up still drops correctly.
 *
 * Pointer edges come from UIPointer (the frame-latched pointer state) — never
 * `mouse_check_button*` directly, which are sampled realtime on GMRT (see CLAUDE.md).
 */
globalThis.SlotDrag = class SlotDrag {
  static active = false;
  static source = null; // the UISlots the item came from
  static sourceIndex = -1;
  static item = null; // the carried slot item
  static iconSize = 48;

  // The last slot the cursor was over during the drag (persisted, seeded to source).
  static hoverGrid = null;
  static hoverSlot = -1;

  /** Pick up the item in `grid` slot `i` (source slot empties). @param {UISlots} grid @param {number} i */
  static begin(grid, i) {
    if (SlotDrag.active) return;
    const it = grid.items[i];
    if (it == null) return;
    SlotDrag.active = true;
    SlotDrag.source = grid;
    SlotDrag.sourceIndex = i;
    SlotDrag.item = it;
    SlotDrag.hoverGrid = grid; // seed: release with no move → restore to source
    SlotDrag.hoverSlot = i;
    grid.items[i] = null; // pick up — source slot shows empty while dragging
  }

  /** Record the drop target — a draggable grid reports the slot under the cursor each frame. @param {UISlots} grid @param {number} j */
  static hover(grid, j) {
    SlotDrag.hoverGrid = grid;
    SlotDrag.hoverSlot = j;
  }

  /**
   * Place the carried item into `grid` slot `j`. Dropping back onto the source slot reads as a
   * click (restore + select); otherwise swap whatever was there back to the source (null if it
   * was empty → a plain move). @param {UISlots} grid @param {number} j
   */
  static drop(grid, j) {
    if (!SlotDrag.active) return;
    if (grid === SlotDrag.source && j === SlotDrag.sourceIndex) {
      grid.items[j] = SlotDrag.item;
      grid.selected = j;
      grid.onSelect(j, SlotDrag.item);
    } else {
      const target = grid.items[j];
      grid.items[j] = SlotDrag.item;
      SlotDrag.source.items[SlotDrag.sourceIndex] = target;
    }
    SlotDrag._reset();
  }

  /** Abort the drag, restoring the item to its source slot. */
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
    SlotDrag.hoverGrid = null;
    SlotDrag.hoverSlot = -1;
  }

  /**
   * Resolve a drag on the release edge (Step_0, after UI.update): the grids recorded their hover
   * this frame, so drop onto the last slot the cursor was over (drift-forgiving), else cancel.
   */
  static update() {
    if (!SlotDrag.active) return;
    if (!UIPointer.released) return;
    if (SlotDrag.hoverGrid !== null) {
      SlotDrag.drop(SlotDrag.hoverGrid, SlotDrag.hoverSlot);
    } else {
      SlotDrag.cancel();
    }
  }

  /** Draw the carried item's icon at the cursor (Draw_75). */
  static draw() {
    if (!SlotDrag.active) return;
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
