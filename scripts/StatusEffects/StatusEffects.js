// Component: the active buffs/debuffs riding on an entity. StatusSystem owns the list — applies
// dot/hot over time, counts down durations, and answers live multiplier queries; the game folds any
// active `mods` into the derived Stats (StatModel._foldStatuses). An entity without this component
// simply has no statuses (StatusSystem adds it lazily on the first apply/maintain).
//
// `list` is an array of flat scalar objects, so the component is world.export-safe and survives an
// EntitySnapshot map migration as-is. For a DISK save serialize it yourself (the JSON nested-value
// fault — same as Inventory.slots): the def is looked up from Status.get(id), so only the instance
// fields below need persisting.
//
// @typedef {Object} StatusEffects
// @property {Array<ActiveStatus>} list
//
// @typedef {Object} ActiveStatus
// @property {string} id        Status def id (look the static data up via Status.get)
// @property {number} remaining seconds left; -1 = maintained/permanent (never auto-expires — driven
//                              externally, e.g. encumbrance, and cleared explicitly)
// @property {number} accum     dot/hot accumulator (seconds since the last interval application)
// @property {Object} [mult]    optional per-instance live multiplier override by stat key — lets a
//                              maintained status carry a dynamic magnitude (encumbrance's gradient)
//                              instead of the def's static `mult`
globalThis.StatusEffects = "StatusEffects";
