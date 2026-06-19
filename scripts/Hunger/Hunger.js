// Survival need: hunger. A "rising meter" — `value` climbs by `rate`/sec (0 = full, `max` =
// starving); eating (a Consumable with `hunger`) lowers it. HungerSystem ticks it and, once
// `value/max >= critical`, applies the `status` debuff (a Status id, e.g. "starving" — damage over
// time) until the player eats back below the threshold. OPT-IN like Stamina/Encumbrance: only an
// entity carrying this participates. Flat scalars → world.export / EntitySnapshot safe.
//
// @typedef {Object} Hunger
// @property {number} value     current need, 0..max (rises over time)
// @property {number} max       cap
// @property {number} rate      per-second rise
// @property {number} critical  fraction of max (0..1) at/above which `status` is applied
// @property {string} status    Status id applied while critical ("" = no debuff)
globalThis.Hunger = "Hunger";
