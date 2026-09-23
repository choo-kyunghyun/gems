/**
 * A timed charge on a lobbed entity: when `secs` runs out it detonates where it lies, then is
 * removed. Flat scalars only, so a charge in flight rides a save / map transfer.
 * @typedef {Object} Fuse
 * @property {number} secs         sim seconds until detonation
 * @property {number} radius       blast radius (world px)
 * @property {number} damage       damage at the blast centre; halves toward the edge
 * @property {number} owner        entity id whose faction the blast spares (the thrower)
 * @property {number} [penetration] armor penetration at each hit. Default 0.
 */
globalThis.Fuse = "Fuse";
