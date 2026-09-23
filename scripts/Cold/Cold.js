/**
 * Survival need: cold. The meter rises while the temperature where the body stands is under
 * `comfort`, in proportion to the shortfall, and falls in warmth. Opt-in; flat scalars, so
 * export-safe.
 *
 * @typedef {Object} Cold
 * @property {number} value     0..max
 * @property {number} max
 * @property {number} rate      per-second rise at the full shortfall (comfort − span and below)
 * @property {number} recover   per-second fall at or above comfort
 * @property {number} critical  fraction of max (0..1) at/above which `status` is applied
 * @property {string} status    Status id applied while critical ("" = no debuff)
 * @property {number} comfort   Kelvin at/above which the body recovers
 * @property {number} span      Kelvin below comfort at which the rise reaches the full rate
 */
globalThis.Cold = "Cold";
