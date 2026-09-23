/**
 * Opt-in survival need: a meter that rises over time and falls on eating, with a debuff at or
 * above `critical`.
 *
 * @typedef {Object} Hunger
 * @property {number} value     0..max
 * @property {number} max
 * @property {number} rate      per-second rise
 * @property {number} critical  fraction of max (0..1)
 * @property {string} status    Status id applied while critical ("" = no debuff)
 */
globalThis.Hunger = "Hunger";
