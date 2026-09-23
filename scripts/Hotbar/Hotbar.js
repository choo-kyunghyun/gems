/**
 * Quick-use bar of bound item ids. A slot need not hold an owned item; using one the bag lacks
 * is a no-op.
 *
 * @typedef {Object} Hotbar
 * @property {string[]} slots  itemId per slot, "" = empty
 * @property {number}   size
 */
globalThis.Hotbar = "Hotbar";

globalThis.HOTBAR_SIZE = 5;

/** Stateless operations on a Hotbar; an out-of-range slot is a no-op. */
globalThis.HotbarSystem = {
  set(hb, i, itemId) {
    if (i >= 0 && i < hb.slots.length) hb.slots[i] = itemId;
  },

  clear(hb, i) {
    if (i >= 0 && i < hb.slots.length) hb.slots[i] = "";
  },

  /** -1 when full */
  firstFree(hb) {
    for (let i = 0; i < hb.slots.length; i++) if (hb.slots[i] === "") return i;
    return -1;
  },

  indexOf(hb, itemId) {
    for (let i = 0; i < hb.slots.length; i++)
      if (hb.slots[i] === itemId) return i;
    return -1;
  },

  /** Clears every slot bound to itemId; returns whether any was. */
  clearItem(hb, itemId) {
    let cleared = false;
    for (let i = 0; i < hb.slots.length; i++)
      if (hb.slots[i] === itemId) {
        hb.slots[i] = "";
        cleared = true;
      }
    return cleared;
  },
};
