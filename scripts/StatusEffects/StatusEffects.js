// Component: active buffs/debuffs on an entity (StatusSystem owns the list, adds it lazily on first apply).
// `list` is flat scalar objects → world.export / EntitySnapshot-safe; for DISK save serialize yourself
// (JSON nested-value fault), the def is Status.get(id) so only the instance fields below need persisting.
//
// @typedef {Object} StatusEffects
// @property {Array<ActiveStatus>} list
//
// @typedef {Object} ActiveStatus
// @property {string} id        Status def id (static data via Status.get)
// @property {number} remaining seconds left; -1 = maintained/permanent (driven externally, e.g. encumbrance)
// @property {number} accum     dot/hot accumulator (seconds since last interval application)
// @property {Object} [mult]    per-instance live multiplier override — a maintained status's dynamic magnitude
globalThis.StatusEffects = "StatusEffects";
