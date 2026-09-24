/**
 * Equipped gear by slot. A slot holds the instance `uid` — not the itemId, since two of one item
 * may differ by mods — or "". The item itself stays in the Inventory.
 *
 * @typedef {Object} Equipment
 * @property {Object} slots   { weapon, armor, trinket, backpack } → instance uid strings
 */
globalThis.Equipment = "Equipment";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Equipment] = { slots: { weapon: "", armor: "", trinket: "", backpack: "" } };
