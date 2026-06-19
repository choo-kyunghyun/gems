/**
 * World pickup payload — sits on a non-solid sensor entity that the player
 * collects on overlap (see CollectibleSystem-style pickup in sceneRpg).
 *
 * A dropped INSTANCE (modded gear) carries its `uid`/`mods` so pickup re-inserts the same
 * instance (installed mods preserved) rather than minting a fresh one. Fungible drops omit them.
 *
 * @typedef {Object} ItemDrop
 * @property {string} itemId
 * @property {number} qty
 * @property {string} [uid]      instance id (dropped gear only)
 * @property {string[]} [mods]   installed weapon-mod itemIds (instance only)
 */
globalThis.ItemDrop = "ItemDrop";
