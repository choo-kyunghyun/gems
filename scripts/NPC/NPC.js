/**
 * Interactable non-player entity. The scene proximity-checks the player against
 * NPCs and, on the interact key, opens a dialogue panel that can offer/turn in
 * the linked quest.
 *
 * @typedef {Object} NPC
 * @property {string} name        i18n key for the display name
 * @property {string[]} lines     i18n keys spoken in order
 * @property {string} [questId]   quest this NPC offers and accepts turn-in for
 */
globalThis.NPC = "NPC";
