/**
 * Component: active buffs/debuffs (StatusSystem owns the list, adds it lazily). `list` is flat scalars
 * → entities.export/EntitySnapshot-safe; DISK save serializes yourself (nested fault). def = Status.get(id).
 *
 * @typedef {Object} StatusEffects
 * @property {Array<ActiveStatus>} list
 *
 * @typedef {Object} ActiveStatus
 * @property {string} id        Status def id (static data via Status.get)
 * @property {number} remaining seconds left; -1 = maintained/permanent (driven externally, e.g. encumbrance)
 * @property {number} accum     dot/hot accumulator (seconds since last interval application)
 * @property {Object} [mult]    per-instance live multiplier override — a maintained status's dynamic magnitude
 */
globalThis.StatusEffects = "StatusEffects";
