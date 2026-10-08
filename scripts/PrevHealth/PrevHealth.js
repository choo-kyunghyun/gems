/**
 * Health at the last observation, the baseline a damage readout diffs against. Absent means no
 * baseline yet, so a first observation (a spawn, a load, a revive) shows nothing.
 * @typedef {Object} PrevHealth
 * @property {number} hp
 */
globalThis.PrevHealth = "PrevHealth";
// any script may load first (docs/GMRT.md)
(globalThis.Mint ??= {})[PrevHealth] = true; // rebuilt at runtime, never saved
