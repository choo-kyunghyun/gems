// Quick-use bar on the player: a fixed-length list of bound itemIds triggered by the number
// keys (hotbar1..N — see RpgController). A slot is an itemId string or "" (empty). Flat scalar
// array, so it rides world.export / EntitySnapshot like Inventory.slots — carried across map
// changes in RpgMap.go's player-sheet snapshot (it's session-scoped player state, like Stamina).
//
// Binding is manual (the inventory Items tab's hotbar strip assigns/clears a slot); triggering a
// slot uses whatever it holds (consumable or equip toggle) via RpgInventoryUI.useItem. The bound
// item need not be in the bag — useItem/ConsumableSystem no-op when the player doesn't own it, so
// a slot can stay bound to a potion you've run out of and re-arm when you pick more up.
//
// @typedef {Object} Hotbar
// @property {string[]} slots  itemId per slot, "" = empty (length === size)
// @property {number}   size   number of slots
globalThis.Hotbar = "Hotbar";

// Number of quick-use slots — the single source of truth shared by the player sheet (RpgPlayer.spawn),
// the input bindings (RpgController hotbar1..N), the HUD bar (RpgHud), and the inventory manage strip
// (RpgInventoryUI). A global int so all four agree; read at runtime only (no load-order dependency).
globalThis.RPG_HOTBAR_SIZE = 5;

// Genre-agnostic operations on a Hotbar component (no world tick), the project's System pattern.
globalThis.HotbarSystem = {
  // Bind itemId to slot i (out-of-range is a no-op).
  set(hb, i, itemId) {
    if (i >= 0 && i < hb.slots.length) hb.slots[i] = itemId;
  },

  // Clear slot i.
  clear(hb, i) {
    if (i >= 0 && i < hb.slots.length) hb.slots[i] = "";
  },

  // First empty slot index, or -1 when full.
  firstFree(hb) {
    for (let i = 0; i < hb.slots.length; i++) if (hb.slots[i] === "") return i;
    return -1;
  },

  // Slot index currently bound to itemId, or -1.
  indexOf(hb, itemId) {
    for (let i = 0; i < hb.slots.length; i++)
      if (hb.slots[i] === itemId) return i;
    return -1;
  },

  // Clear EVERY slot bound to itemId (the manage strip can bind one item to several slots).
  // Returns true if any slot was cleared.
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
