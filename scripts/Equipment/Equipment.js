/**
 * Per-entity equipped gear keyed by slot. Each value is the equipped instance's `uid` (not itemId —
 * two of one itemId may differ by mods) or "". The item stays in the Inventory; the slot only
 * references its uid. Stores flat uid strings — safe for entities.export.
 *
 * @typedef {Object} Equipment
 * @property {Object} slots   { weapon, armor, trinket, backpack } → instance uid strings
 */
globalThis.Equipment = "Equipment";
