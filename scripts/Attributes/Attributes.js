// Per-entity PRIMARY attributes — the data-driven, game-specific stat INPUTS (this RPG's set is
// POW/VIT/AGI/END; see StatModel). A flat { key: number } bag, so it's world.export / JSON safe.
//
// OPT-IN: the player (and any attribute-driven NPC) carries one; monsters skip it and author their
// derived Stats directly. The DERIVED combat stats (Stats: maxHp/attack/defense/speed/maxStamina)
// are computed from this by StatModel.recompute — combat reads only the derived Stats, never these,
// so swapping the attribute model (to D&D-6, SPECIAL, …) is a StatModel-only change.
//
// usage: world.add(id, Attributes, StatModel.defaults())  // or a tuned { pow, vit, agi, end }
/** @typedef {Object<string, number>} Attributes */
globalThis.Attributes = "Attributes";
