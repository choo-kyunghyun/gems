/**
 * Per-entity item store; an enemy's Inventory is its loot table. A slot is fungible (qty stacks,
 * no uid/mods) or an instance (qty 1, carrying uid and mods inline so per-instance state rides
 * transfer, drop and export for free).
 *
 * @typedef {Object} InventorySlot
 * @property {string} itemId
 * @property {number} qty
 * @property {string} [uid]      instance id (instances only)
 * @property {Object<string,string>} [mods]  instance only: weapon slotId -> mod itemId; a map,
 *   since a slot holds at most one
 * @property {string} [ammo]     gun instance only: loaded ammo itemId; "" = none chosen, absent
 *   on a fresh gun until first use
 * @property {number} [rounds]   gun instance only: rounds in the magazine
 *
 * @typedef {Object} Inventory
 * @property {InventorySlot[]} slots
 * @property {number} capacity    max slots
 * @property {number} [maxWeight] omit for none
 */
globalThis.Inventory = "Inventory";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Inventory] = { slots: [] };
