/**
 * Component: active buffs/debuffs, added lazily. Entries are flat scalars, so they export as
 * plain data.
 *
 * @typedef {Object} StatusEffects
 * @property {Array<ActiveStatus>} list
 *
 * @typedef {Object} ActiveStatus
 * @property {string} id        status def id
 * @property {number} remaining seconds left; -1 = maintained, driven externally
 * @property {number} accum     seconds since the last periodic application
 * @property {Object} [mult]    a maintained status's live magnitude override
 */
globalThis.StatusEffects = "StatusEffects";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[StatusEffects] = { list: [] };
