/**
 * World pickup payload on a ground entity. A dropped instance carries the source slot's instance
 * fields so pickup re-inserts the same instance; fungible drops omit them. The instance fields
 * share an inventory slot's shapes.
 *
 * @typedef {Object} ItemDrop
 * @property {string} itemId
 * @property {number} qty
 * @property {string} [uid]      instance id (gear only)
 * @property {Object<string,string>} [mods]  mod slotId -> attachment itemId (instance only)
 * @property {string} [ammo]     loaded ammo itemId (gun instance only)
 * @property {number} [rounds]   chambered rounds (gun instance only)
 */
globalThis.ItemDrop = "ItemDrop";
