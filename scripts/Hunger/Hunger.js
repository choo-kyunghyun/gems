// Survival need: hunger — a rising meter (`value` climbs by `rate`/sec; eating lowers it). HungerSystem
// applies the `status` debuff at/above `critical`. OPT-IN; flat scalars → entities.export-safe.
//
// @typedef {Object} Hunger
// @property {number} value     current need, 0..max (rises over time)
// @property {number} max       cap
// @property {number} rate      per-second rise
// @property {number} critical  fraction of max (0..1) at/above which `status` is applied
// @property {string} status    Status id applied while critical ("" = no debuff)
globalThis.Hunger = "Hunger";
