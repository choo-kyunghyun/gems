/**
 * Per-entity item store. Player, enemies, and containers each own one; an
 * enemy's Inventory is its loot table (spilled as ItemDrops on death).
 * Operated on by InventorySystem.
 *
 * @typedef {Object} InventorySlot
 * @property {string} itemId
 * @property {number} qty
 *
 * @typedef {Object} Inventory
 * @property {InventorySlot[]} slots
 * @property {number} capacity   max number of slots
 */
globalThis.Inventory = "Inventory";
