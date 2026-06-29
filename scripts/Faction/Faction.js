// faction membership. relations (ally/neutral/hostile) live in FactionSystem; this only stores the id.
// usage: world.add(id, Faction, { id: "monster" })
/**
 * @typedef {Object} Faction
 * @property {string} id  faction id registered in FactionSystem (e.g. "player", "monster")
 */
globalThis.Faction = "Faction";
