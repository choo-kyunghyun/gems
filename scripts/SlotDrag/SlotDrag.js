/**
 * The one slot-item drag in flight. The drop target persists, so a small drift off the slot at
 * button-up still drops. Pointer edges come from the frame-latched pointer, never polled directly.
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

  /** The source slot shows empty while dragging. */
  begin(grid, i) {
    if (SlotDrag.active) return;
    const it = grid.items[i];
    if (it == null) return;
    SlotDrag.active = true;
    SlotDrag.source = grid;
    SlotDrag.sourceIndex = i;
    SlotDrag.item = it;
    SlotDrag.hoverGrid = grid; // a release with no move restores to the source
    SlotDrag.hoverSlot = i;
    grid.items[i] = null;
  },

  /** Per frame, the slot under the cursor. */
  hover(grid, j) {
    SlotDrag.hoverGrid = grid;
    SlotDrag.hoverSlot = j;
  },

  /** Back onto the source slot reads as a click; otherwise the occupant swaps back to the source. */
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

  /** On the release edge, after the UI update. */
  update() {
    if (!SlotDrag.active) return;
    if (!Input.pointer.left.released) return;
    if (SlotDrag.hoverGrid !== null) {
      SlotDrag.drop(SlotDrag.hoverGrid, SlotDrag.hoverSlot);
    } else {
      SlotDrag.cancel();
    }
  },

  /** The carried icon at the cursor, over the GUI. */
  draw() {
    if (!SlotDrag.active) return;
    const it = SlotDrag.item;
    if (it == null || it.sprite == null || !sprite_exists(it.sprite)) return;

    const mx = Input.pointer.x;
    const my = Input.pointer.y;
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
