/**
 * Per-entity item store (player/enemies/containers). An enemy's Inventory is its loot table.
 * A slot is FUNGIBLE (shared def — qty stacks, no uid/mods) or an INSTANCE (unique gear — qty 1,
 * carrying uid + mods inline so per-instance state rides transfer/drop/export for free).
 * Item.isInstanced() decides; today every equippable is an instance.
 *
 * @typedef {Object} InventorySlot
 * @property {string} itemId
 * @property {number} qty
 * @property {string} [uid]      instance id (gear only) — what Equipment.slots reference
 * @property {Object<string,string>} [mods]  instance only: installed attachments as
 *   { weapon slotId -> WeaponMod itemId } — a MAP, not a list, since a slot holds at most one
 *
 * @typedef {Object} Inventory
 * @property {InventorySlot[]} slots
 * @property {number} capacity    max slots
 * @property {number} [maxWeight] max total weight; omit for none (loot tables)
 */
globalThis.Inventory = "Inventory";
