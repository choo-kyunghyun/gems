// Resident MEMBERSHIP — an entity belonging to a Settlement (NPCs, merchants, stockpile chest). Flat
// `{ settlementId }` matched by `sid`, resolved live (SettlementSystem.residents); assigned EXPLICITLY.
/**
 * @typedef {Object} Resident
 * @property {string} settlementId  the owning settlement's sid (Settlement.sid — uuid or authored id)
 */
globalThis.Resident = "Resident";
