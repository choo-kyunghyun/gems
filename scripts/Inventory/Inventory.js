/**
 * Per-entity item store. Player, enemies, and containers each own one; an
 * enemy's Inventory is its loot table (spilled as ItemDrops on death).
 * Operated on by InventorySystem.
 *
 * A slot is either FUNGIBLE (a shared Item definition — potions/materials/currency;
 * qty stacks, no uid/mods) or an INSTANCE (a unique piece of gear — qty is always 1
 * and it carries `uid` + `mods` inline, so per-instance state rides transfer / drop /
 * world.export / EntitySnapshot for free). Item.isInstanced() decides which; today
 * every equippable is an instance. See the definition-vs-instance split in ARCHITECTURE.
 *
 * @typedef {Object} InventorySlot
 * @property {string} itemId
 * @property {number} qty
 * @property {string} [uid]      instance id (unique gear only) — what Equipment.slots reference
 * @property {string[]} [mods]   installed weapon-mod itemIds (instance only; flat, GMRT-safe)
 *
 * @typedef {Object} Inventory
 * @property {InventorySlot[]} slots
 * @property {number} capacity    max number of slots (quantity limit)
 * @property {number} [maxWeight] max total weight (sum of Item.weight * qty);
 *                                omit for no weight limit (e.g. loot tables)
 */
globalThis.Inventory = "Inventory";
