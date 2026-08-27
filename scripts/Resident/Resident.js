// Resident MEMBERSHIP — an entity belonging to a Settlement (NPCs, merchants, stockpile chest). Flat
// `{ settlementId }` matched by the settlement's level id, resolved live (SettlementSystem.residents);
// assigned EXPLICITLY.
/**
 * @typedef {Object} Resident
 * @property {string} settlementId  the owning settlement's id — its level's map id (Settlement.id)
 */
globalThis.Resident = "Resident";
