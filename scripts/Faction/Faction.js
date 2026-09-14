// faction membership. relations (ally/neutral/hostile) live in Diplomacy; this only stores the id.
// usage: entities.add(id, Faction, { id: "monster" })
/**
 * @typedef {Object} Faction
 * @property {string} id  faction id registered in Diplomacy (e.g. "player", "monster")
 */
globalThis.Faction = "Faction";
