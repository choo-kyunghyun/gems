/**
 * Non-player entity: the dialogue panel's name/lines and its quest. Its E behaviour is its Interaction
 * (`talk` / `trade`, set by ColonySpawn), picked by Interactable beside every station.
 *
 * @typedef {Object} NPC
 * @property {string} name        i18n key for the display name
 * @property {string[]} lines     i18n keys spoken in order
 * @property {string} [questId]   quest this NPC offers and accepts turn-in for
 */
globalThis.NPC = "NPC";
