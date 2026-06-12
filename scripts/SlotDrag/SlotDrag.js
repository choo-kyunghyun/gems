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
 * Mouse edges (`pressed`/`released`) are latched once per frame in `poll()` and read
 * by UISlots + this class — never `mouse_check_button*` directly. On GMRT those
 * functions are sampled realtime, so reading the same query twice in a frame returns
 * different values (it made the drop and cancel paths disagree on the release edge).
 * See the GMRT-Safe Idioms note in CLAUDE.md.
 */
globalThis.SlotDrag = class SlotDrag {
  static active = false;
  static source = null; // the UISlots the item came from
  static sourceIndex = -1;
  static item = null; // the carried slot item
  static iconSize = 48;

  // Frame-latched mouse edges (read once per frame in poll, shared by all readers).
  static pressed = false;
  static released = false;

  // The last slot the cursor was over during the drag (persisted, seeded to source).
  static hoverGrid = null;
  static hoverSlot = -1;

  // Called once per frame in Step_0, before UI.update().
  static poll() {
    SlotDrag.pressed = mouse_check_button_pressed(mb_left);
    SlotDrag.released = mouse_check_button_released(mb_left);
  }

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

  // A draggable grid reports the slot under the cursor each frame during a drag.
  static hover(grid, j) {
    SlotDrag.hoverGrid = grid;
    SlotDrag.hoverSlot = j;
  }

  // Place the carried item into grid[j]. Dropping back onto the source slot reads as
  // a click (restore + select); otherwise swap whatever was there back to the source
  // (null if it was empty → a plain move).
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

  // Step_0, after UI.update: the grids have recorded their hover this frame, so on the
  // release edge drop onto the last slot the cursor was over (drift-forgiving).
  static update() {
    if (!SlotDrag.active) return;
    if (!SlotDrag.released) return;
    if (SlotDrag.hoverGrid !== null) {
      SlotDrag.drop(SlotDrag.hoverGrid, SlotDrag.hoverSlot);
    } else {
      SlotDrag.cancel();
    }
  }

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
