/**
 * World pickup payload on a non-solid sensor entity, collected on overlap.
 * A dropped instance carries the source slot's instance fields so pickup re-inserts the same
 * instance; fungible drops omit them. Instance-field shapes mirror InventorySlot (Inventory).
 *
 * @typedef {Object} ItemDrop
 * @property {string} itemId
 * @property {number} qty
 * @property {string} [uid]      instance id (gear only)
 * @property {Object<string,string>} [mods]  installed mods, mod slotId -> attachment itemId (instance only)
 * @property {string} [ammo]     loaded ammo itemId (gun instance only)
 * @property {number} [rounds]   chambered rounds (gun instance only)
 */
globalThis.ItemDrop = "ItemDrop";
