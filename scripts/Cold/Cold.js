/**
 * Survival need: cold. No meter — `status` holds exactly while the temperature the body feels,
 * its gear's warmth included, is at or below `threshold`. Opt-in; flat scalars, so export-safe.
 *
 * @typedef {Object} Cold
 * @property {number} threshold Kelvin felt at/below which `status` is applied
 * @property {string} status    Status id applied while cold
 */
globalThis.Cold = "Cold";
