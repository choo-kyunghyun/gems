// SlotDrag — shared drag-and-drop state for UISlots grids (singleton, not a UIComponent): begin()
// picks up on press, hover() records the target, update() resolves on release. Contract below.
/**
 * The target is PERSISTED, so a small drift off the slot at button-up still drops. Pointer edges come
 * from UIPointer (frame-latched) — never mouse_check_button* directly (the poll-once rule — UIPointer).
 */
globalThis.SlotDrag = {
  active: false,
  source: null, // the UISlots the item came from
  sourceIndex: -1,
  item: null, // the carried slot item
  iconSize: 48,

  // last slot the cursor was over (persisted, seeded to source)
  hoverGrid: null,
  hoverSlot: -1,

  /** Pick up the item in `grid` slot `i` (source slot empties). @param {UISlots} grid @param {number} i */
  begin(grid, i) {
    if (SlotDrag.active) return;
    const it = grid.items[i];
    if (it == null) return;
    SlotDrag.active = true;
    SlotDrag.source = grid;
    SlotDrag.sourceIndex = i;
    SlotDrag.item = it;
    SlotDrag.hoverGrid = grid; // seed: release with no move → restore to source
    SlotDrag.hoverSlot = i;
    grid.items[i] = null; // source slot shows empty while dragging
  },

  /** Record the drop target (the grid reports the slot under the cursor each frame). @param {UISlots} grid @param {number} j */
  hover(grid, j) {
    SlotDrag.hoverGrid = grid;
    SlotDrag.hoverSlot = j;
  },

  /**
   * Place the carried item into `grid` slot `j`. Back onto the source slot reads as a click
   * (restore + select); otherwise swap the occupant back to source. @param {UISlots} grid @param {number} j
   */
  drop(grid, j) {
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
  },

  /** Abort the drag, restoring the item to its source slot. */
  cancel() {
    if (!SlotDrag.active) return;
    SlotDrag.source.items[SlotDrag.sourceIndex] = SlotDrag.item;
    SlotDrag._reset();
  },

  _reset() {
    SlotDrag.active = false;
    SlotDrag.source = null;
    SlotDrag.sourceIndex = -1;
    SlotDrag.item = null;
    SlotDrag.hoverGrid = null;
    SlotDrag.hoverSlot = -1;
  },

  /** Resolve on the release edge (Step_0, after UI.update): drop onto the last hovered slot, else cancel. */
  update() {
    if (!SlotDrag.active) return;
    if (!UIPointer.released) return;
    if (SlotDrag.hoverGrid !== null) {
      SlotDrag.drop(SlotDrag.hoverGrid, SlotDrag.hoverSlot);
    } else {
      SlotDrag.cancel();
    }
  },

  /** Draw the carried item's icon at the cursor (Draw_75). */
  draw() {
    if (!SlotDrag.active) return;
    const it = SlotDrag.item;
    if (it == null || it.sprite == null || !sprite_exists(it.sprite)) return;

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const sz = SlotDrag.iconSize;
    const sub = it.subimg ?? 0;
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
  },
};
