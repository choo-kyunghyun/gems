/**
 * A weapon built into the entity, shaped as a carried weapon's Inventory slot so it composes and
 * reloads as one. It is no item: nothing picks it up, equips it or drops it.
 *
 * @typedef {Object} Armament
 * @property {string} itemId  the weapon item it composes as
 * @property {string} ammo    the chambered ammo item; "" = none chosen yet
 * @property {number} rounds
 * @property {Object} mods    attachment slotId -> mod itemId
 */
globalThis.Armament = "Armament";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Armament] = { itemId: "", ammo: "", rounds: 0, mods: {} };
