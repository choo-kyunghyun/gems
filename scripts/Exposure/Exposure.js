/**
 * Survival need: exposure — the thin air. A rising meter while the body stands under the open sky
 * (`value` climbs by `rate`/sec, cut by the seal of the gear worn — Equippable.seal) and a FALLING
 * one while sheltered (a room, an indoor map — by `recover`/sec). ExposureSystem applies the
 * `status` debuff at/above `critical`. OPT-IN; flat scalars → entities.export-safe.
 *
 * @typedef {Object} Exposure
 * @property {number} value     current need, 0..max
 * @property {number} max       cap
 * @property {number} rate      per-second rise under the open sky, unsealed
 * @property {number} recover   per-second fall while sheltered
 * @property {number} critical  fraction of max (0..1) at/above which `status` is applied
 * @property {string} status    Status id applied while critical ("" = no debuff)
 */
globalThis.Exposure = "Exposure";
