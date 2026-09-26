// Stateless operations on a Hotbar component; an out-of-range slot is a no-op.
globalThis.Belt = {
  set(hb, i, itemId) {
    if (i >= 0 && i < hb.slots.length) hb.slots[i] = itemId;
  },

  clear(hb, i) {
    if (i >= 0 && i < hb.slots.length) hb.slots[i] = "";
  },

  /** Whether any slot is bound to itemId. */
  has(hb, itemId) {
    return hb.slots.indexOf(itemId) >= 0;
  },
};
