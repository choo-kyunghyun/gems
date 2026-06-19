/**
 * Per-entity equipped gear, keyed by slot. Each value is the equipped INSTANCE's `uid`
 * (the specific inventory slot — gear is unstackable, and two of one itemId may differ
 * by installed mods, so an itemId can't say "which one") or "" when empty. The item
 * itself stays in the Inventory; the slot only references its uid. Operated on by
 * EquipmentSystem, which re-derives the owner's Stats (base + each equipped instance's
 * mods) on equip/unequip. Stores only uid strings (flat) — safe for world.export.
 *
 * @typedef {Object} Equipment
 * @property {Object} slots   { weapon, armor, trinket, backpack } → instance uid strings
 */
globalThis.Equipment = "Equipment";
