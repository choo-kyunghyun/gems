/**
 * Quick-use bar of bound item ids. A slot need not hold an owned item, so a binding outlives the
 * stock it names; using one the bag lacks is refused.
 *
 * @typedef {Object} Hotbar
 * @property {string[]} slots  itemId per slot, "" = empty; HOTBAR_SIZE long
 */
globalThis.Hotbar = "Hotbar";

globalThis.HOTBAR_SIZE = 5;
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Hotbar] = {
  slots: new Array(HOTBAR_SIZE).fill(""),
};
