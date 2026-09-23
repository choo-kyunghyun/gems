/**
 * A heat source: warms the room it stands in. `power` is Kelvin·cells per in-game hour — a room's
 * equilibrium rise is its sources' power over its leak rate × its cell count, so one source warms
 * a closet more than a hall and does nothing outside. Opt-in; a flat scalar, so it saves as is.
 *
 * @typedef {Object} Heat
 * @property {number} power
 */
globalThis.Heat = "Heat";
