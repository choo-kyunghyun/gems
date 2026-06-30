// Quick-use bar: flat string[] of bound itemIds (or "" empty), carried in the player-sheet snapshot.
// A slot need not hold an owned item — useItem/ConsumableSystem no-ops if the item isn't in the bag.
// @typedef {Object} Hotbar
// @property {string[]} slots  itemId per slot, "" = empty
// @property {number}   size   slot count
globalThis.Hotbar = "Hotbar";

// single source of truth for slot count (RpgPlayer.spawn / RpgController bindings / RpgHud / RpgInventoryUI)
globalThis.RPG_HOTBAR_SIZE = 5;

// stateless operations on a Hotbar component
globalThis.HotbarSystem = {
  // bind itemId to slot i; out-of-range is a no-op
  set(hb, i, itemId) {
    if (i >= 0 && i < hb.slots.length) hb.slots[i] = itemId;
  },

  // clear slot i
  clear(hb, i) {
    if (i >= 0 && i < hb.slots.length) hb.slots[i] = "";
  },

  // first empty slot index, or -1 when full
  firstFree(hb) {
    for (let i = 0; i < hb.slots.length; i++) if (hb.slots[i] === "") return i;
    return -1;
  },

  // slot index bound to itemId, or -1
  indexOf(hb, itemId) {
    for (let i = 0; i < hb.slots.length; i++)
      if (hb.slots[i] === itemId) return i;
    return -1;
  },

  // clear all slots bound to itemId; returns true if any were cleared
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
