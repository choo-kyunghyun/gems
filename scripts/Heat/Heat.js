/**
 * A heat source: warms the room it stands in (RoomSystem). `power` is Kelvin·cells per in-game
 * hour — a room's equilibrium rise over the outside is the sum of its sources' power over its leak
 * rate × its cell count, so one source warms a closet more than a hall and does nothing outside.
 * OPT-IN; a flat scalar → entities.export-safe.
 *
 * @typedef {Object} Heat
 * @property {number} power
 */
globalThis.Heat = "Heat";
