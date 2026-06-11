/**
 * Per-entity equipped gear, keyed by slot. Each value is an itemId (an Item with
 * a matching `slot`) or "" when empty. Operated on by EquipmentSystem, which
 * applies the equipped items' `mods` to the owner's Stats on equip/unequip.
 * Stores only itemId strings (flat) — safe for world.export.
 *
 * @typedef {Object} Equipment
 * @property {Object} slots   { weapon: string, armor: string, trinket: string }
 */
globalThis.Equipment = "Equipment";
