// Primary attribute bag (POW/VIT/AGI/END) — stat inputs for StatModel.recompute.
// Opt-in: player carries one; monsters author Stats directly. Flat {key:number} → JSON-safe.
// Swap model by changing StatModel only; combat reads derived Stats, never these.
// usage: world.add(id, Attributes, StatModel.defaults())
// MUST survive a map change. Attribute shards are the only permanent progression channel (there
// is no XP), so a reset here silently erases play. Free today because the player migrates as a
// WHOLE entity (RpgMap.go → LevelManager.take/put), not as a copied component subset — anything
// that ever narrows that transfer has to carry this, Stamina, and the Survival needs explicitly.
/** @typedef {Object<string, number>} Attributes */
globalThis.Attributes = "Attributes";
