// Resident MEMBERSHIP — an entity that belongs to a Settlement (its inhabitants: NPCs, merchants,
// the stockpile chest, and — later — workers). Mirrors Squad exactly: a flat `{ settlementId }`
// scalar (EntitySnapshot / world.export-safe), matched by the settlement's `sid`, resolved by LIVE
// query (SettlementSystem.residents), never a stored roster. Assigned EXPLICITLY — a spawn
// descriptor's `settlement: <sid>` field attaches it in RpgSpawn.spawnEntity (no auto-by-location).
/**
 * @typedef {Object} Resident
 * @property {string} settlementId  the owning settlement's sid (Settlement.sid — uuid or authored id)
 */
globalThis.Resident = "Resident";
