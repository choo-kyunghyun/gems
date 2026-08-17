// Primary attribute bag (POW/VIT/AGI/END) — stat inputs for StatModel.recompute. Opt-in (player
// carries one; monsters author Stats directly); flat {key:number}, JSON-safe. MUST survive a map
// change: shards are the only permanent progression (no XP), safe today only because the player
// migrates as a WHOLE entity (RpgMap.go → World.take/put), not a copied component subset.
/** @typedef {Object<string, number>} Attributes */
globalThis.Attributes = "Attributes";
