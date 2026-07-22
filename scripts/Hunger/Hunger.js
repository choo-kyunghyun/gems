// Survival need: hunger. A rising meter — `value` climbs by `rate`/sec; eating (Consumable with `hunger`)
// lowers it. HungerSystem ticks it and applies the `status` debuff (e.g. "starving") at/above `critical`.
// OPT-IN like Stamina/Encumbrance. Flat scalars → entities.export / EntitySnapshot safe.
//
// @typedef {Object} Hunger
// @property {number} value     current need, 0..max (rises over time)
// @property {number} max       cap
// @property {number} rate      per-second rise
// @property {number} critical  fraction of max (0..1) at/above which `status` is applied
// @property {string} status    Status id applied while critical ("" = no debuff)
globalThis.Hunger = "Hunger";
