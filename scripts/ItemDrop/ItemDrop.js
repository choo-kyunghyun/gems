/**
 * World pickup payload on a non-solid sensor entity, collected on overlap.
 * A dropped instance carries uid/mods so pickup re-inserts the same instance (mods preserved);
 * fungible drops omit them.
 *
 * @typedef {Object} ItemDrop
 * @property {string} itemId
 * @property {number} qty
 * @property {string} [uid]      instance id (gear only)
 * @property {string[]} [mods]   installed mod itemIds (instance only)
 */
globalThis.ItemDrop = "ItemDrop";
