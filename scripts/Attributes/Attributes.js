// Primary attribute bag (POW/VIT/AGI/END) — stat inputs for StatModel.recompute.
// Opt-in: player carries one; monsters author Stats directly. Flat {key:number} → JSON-safe.
// Swap model by changing StatModel only; combat reads derived Stats, never these.
// usage: world.add(id, Attributes, StatModel.defaults())
/** @typedef {Object<string, number>} Attributes */
globalThis.Attributes = "Attributes";
