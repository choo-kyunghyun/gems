/**
 * Survival need: a rising meter that sleeping lowers, with a debuff at `critical`. Opt-in.
 *
 * @typedef {Object} Drowsiness
 * @property {number} value     0..max
 * @property {number} max
 * @property {number} rate      per-second rise
 * @property {number} critical  fraction of max (0..1) at/above which `status` is applied
 * @property {string} status    Status id applied while critical ("" = no debuff)
 */
globalThis.Drowsiness = "Drowsiness";
