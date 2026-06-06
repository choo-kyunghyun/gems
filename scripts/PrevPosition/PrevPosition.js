/**
 * Position as of the start of the current physics tick. InterpolationSystem
 * snapshots it each tick so renderers can lerp between PrevPosition and
 * Position by world.alpha, keeping fixed-step motion smooth on displays whose
 * refresh rate doesn't match the tickrate.
 * @typedef {Object} PrevPosition
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */
globalThis.PrevPosition = "PrevPosition";
