/**
 * SlotDrag — shared drag-and-drop state for UISlots grids, a standalone static
 * singleton (NOT a UIComponent), drawn on top like Tooltip/Toast.
 *
 * A draggable UISlots calls `SlotDrag.begin(grid, i)` on press over a filled slot
 * (picks the item up — the source slot goes empty) and, every frame the cursor is
 * over one of its slots during a drag, `SlotDrag.hover(grid, j)` to report the
 * current drop target. `SlotDrag.draw()` (Draw_75, after UI.draw) resolves the drag
 * on button-up: drop onto the reported hover slot, or — if the cursor is over no slot
 * — return the item to its source. The reported hover is cleared each frame so a
 * stale target can't be reused.
 *
 * Resolving on button-up (a level check) rather than on the single
 * mouse_check_button_released edge is deliberate: the grid only needs to *report*
 * the hovered slot, not catch the exact release frame, so a release that lands a
 * frame off (or while the cursor is mid-move) still drops correctly instead of
 * racing the cancel.
 *
 * GMRT note: state is read live each frame; no cached primitive bool, no timer.
 */
globalThis.SlotDrag = class SlotDrag {
  static active = false;
  static source = null; // the UISlots the item came from
  static sourceIndex = -1;
  static item = null; // the carried slot item
  static hoverGrid = null; // drop target reported under the cursor this frame
  static hoverIndex = -1;
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

  // A draggable grid reports the slot under the cursor each frame during a drag.
  static hover(grid, j) {
    SlotDrag.hoverGrid = grid;
    SlotDrag.hoverIndex = j;
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
    SlotDrag.hoverIndex = -1;
  }

  static draw() {
    if (!SlotDrag.active) return;

    // Resolve on button-up: drop onto the reported slot, else return to source.
    if (!mouse_check_button(mb_left)) {
      if (SlotDrag.hoverGrid !== null) {
        SlotDrag.drop(SlotDrag.hoverGrid, SlotDrag.hoverIndex);
      } else {
        SlotDrag.cancel();
      }
      return;
    }

    const it = SlotDrag.item;
    if (it != null && it.sprite != null && sprite_exists(it.sprite)) {
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

    // Clear the reported hover so a stale target can't be used next frame; grids
    // re-report it each frame the cursor is over one of their slots.
    SlotDrag.hoverGrid = null;
    SlotDrag.hoverIndex = -1;
  }
};
