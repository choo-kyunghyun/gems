/**
 * Position at the start of the current tick (InterpolationSystem snapshots it). Renderers lerp
 * PrevPosition→Position by SimClock.alpha to smooth fixed-step motion when refresh != tickrate.
 * @typedef {Object} PrevPosition
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */
globalThis.PrevPosition = "PrevPosition";
