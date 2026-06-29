/**
 * Interactable non-player entity. Scene opens a dialogue panel on interact that can offer/turn in a quest.
 *
 * @typedef {Object} NPC
 * @property {string} name        i18n key for the display name
 * @property {string[]} lines     i18n keys spoken in order
 * @property {string} [questId]   quest this NPC offers and accepts turn-in for
 */
globalThis.NPC = "NPC";
