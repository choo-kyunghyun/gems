// Survival need: drowsiness. A "rising meter" — `value` climbs by `rate`/sec (0 = rested, `max` =
// exhausted); SLEEPING (a bed → scene._sleep) lowers it (the scene drains it via
// DrowsinessSystem.restore while time is fast-forwarded). DrowsinessSystem ticks the rise and, once
// `value/max >= critical`, applies the `status` debuff (a Status id, e.g. "drowsy" — a speed slow)
// until the player rests below the threshold. OPT-IN like Stamina/Encumbrance: only an entity
// carrying this participates. Flat scalars → world.export / EntitySnapshot safe.
//
// @typedef {Object} Drowsiness
// @property {number} value     current need, 0..max (rises over time; sleep lowers it)
// @property {number} max       cap
// @property {number} rate      per-second rise
// @property {number} critical  fraction of max (0..1) at/above which `status` is applied
// @property {string} status    Status id applied while critical ("" = no debuff)
globalThis.Drowsiness = "Drowsiness";
