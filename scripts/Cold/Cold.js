/**
 * Survival need: cold. A rising meter while the temperature where the body stands
 * (RoomSystem.tempAt) is under `comfort` — `value` climbs by up to `rate`/sec, in proportion to the
 * shortfall over `span` Kelvin — and a FALLING one in warmth (by `recover`/sec). ColdSystem applies
 * the `status` debuff at/above `critical`. OPT-IN; flat scalars → entities.export-safe.
 *
 * @typedef {Object} Cold
 * @property {number} value     current need, 0..max
 * @property {number} max       cap
 * @property {number} rate      per-second rise at the full shortfall (comfort − span and below)
 * @property {number} recover   per-second fall at or above comfort
 * @property {number} critical  fraction of max (0..1) at/above which `status` is applied
 * @property {string} status    Status id applied while critical ("" = no debuff)
 * @property {number} comfort   Kelvin at/above which the body recovers
 * @property {number} span      Kelvin below comfort at which the rise reaches the full rate
 */
globalThis.Cold = "Cold";
