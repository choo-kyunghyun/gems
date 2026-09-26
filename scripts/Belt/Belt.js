// Stateless operations on a Hotbar component; an out-of-range slot is a no-op.
globalThis.Belt = {
  /** `uid` pins one instance of gear; "" binds whichever copy. */
  set(hb, i, itemId, uid = "") {
    if (i < 0 || i >= hb.slots.length) return;
    hb.slots[i] = itemId;
    hb.uids[i] = uid;
  },

  clear(hb, i) {
    Belt.set(hb, i, "", "");
  },

  swap(hb, i, j) {
    const n = hb.slots.length;
    if (i < 0 || i >= n || j < 0 || j >= n) return;
    const itemId = hb.slots[i];
    const uid = hb.uids[i];
    Belt.set(hb, i, hb.slots[j], hb.uids[j]);
    Belt.set(hb, j, itemId, uid);
  },

  /** Whether any slot is bound to itemId. */
  has(hb, itemId) {
    return hb.slots.indexOf(itemId) >= 0;
  },

  /**
   * Slot i's pinned instance while `inv` still holds it, else undefined: a lost pin falls back to
   * its item.
   */
  instance(hb, inv, i) {
    const uid = hb.uids[i];
    if (uid === undefined || uid === "") return undefined;
    return Bag.findByUid(inv, uid) !== undefined ? uid : undefined;
  },
};
