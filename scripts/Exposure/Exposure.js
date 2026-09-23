/**
 * Survival need: exposure to the thin air. It rises under the open sky, cut by the seal of the
 * gear worn, and falls while sheltered. Opt-in; flat scalars, so it saves as is.
 *
 * @typedef {Object} Exposure
 * @property {number} value     0..max
 * @property {number} max
 * @property {number} rate      per-second rise under the open sky, unsealed
 * @property {number} recover   per-second fall while sheltered
 * @property {number} critical  fraction of max (0..1) at/above which `status` is applied
 * @property {string} status    Status id applied while critical ("" = no debuff)
 */
globalThis.Exposure = "Exposure";
