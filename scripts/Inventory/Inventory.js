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
 * @property {number} capacity    max number of slots (quantity limit)
 * @property {number} [maxWeight] max total weight (sum of Item.weight * qty);
 *                                omit for no weight limit (e.g. loot tables)
 */
globalThis.Inventory = "Inventory";
