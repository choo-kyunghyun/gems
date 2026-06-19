// Survival need: thirst. A "rising meter" — `value` climbs by `rate`/sec (0 = hydrated, `max` =
// parched); drinking (a Consumable with `thirst`) lowers it. ThirstSystem ticks it and, once
// `value/max >= critical`, applies the `status` debuff (a Status id, e.g. "dehydrated" — damage over
// time) until the player drinks back below the threshold. OPT-IN like Stamina/Encumbrance: only an
// entity carrying this participates. Flat scalars → world.export / EntitySnapshot safe.
//
// @typedef {Object} Thirst
// @property {number} value     current need, 0..max (rises over time)
// @property {number} max       cap
// @property {number} rate      per-second rise
// @property {number} critical  fraction of max (0..1) at/above which `status` is applied
// @property {string} status    Status id applied while critical ("" = no debuff)
globalThis.Thirst = "Thirst";
