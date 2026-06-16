// Faction membership for the RPG. A string-token component (like Health/Light) marking which
// faction an entity belongs to — the player party, monsters, a future bandit clan, town guard, …
// The roster of factions and HOW they relate (ally / neutral / hostile) lives in FactionSystem;
// this component only stores the id. AI and combat decide who fights whom by RELATION
// (FactionSystem.isHostile / nearestHostile / isAlly), never by a hardcoded entity id — so a
// slime aggros any hostile combatant in range and the player's swing skips its own allies.
//
// usage: world.add(id, Faction, { id: "monster" })
globalThis.Faction = "Faction";

/**
 * @typedef {Object} Faction
 * @property {string} id  faction id registered in FactionSystem (e.g. "player", "monster")
 */
