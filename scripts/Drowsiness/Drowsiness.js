// Survival need: drowsiness. A rising meter — `value` climbs by `rate`/sec; SLEEPING (bed → scene._sleep)
// lowers it via DrowsinessSystem.restore. DrowsinessSystem ticks the rise and applies the `status` debuff
// (e.g. "drowsy") at/above `critical`. OPT-IN like Stamina/Encumbrance. Flat scalars → entities.export safe.
//
// @typedef {Object} Drowsiness
// @property {number} value     current need, 0..max (rises over time; sleep lowers it)
// @property {number} max       cap
// @property {number} rate      per-second rise
// @property {number} critical  fraction of max (0..1) at/above which `status` is applied
// @property {string} status    Status id applied while critical ("" = no debuff)
globalThis.Drowsiness = "Drowsiness";
