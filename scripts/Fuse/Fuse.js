/**
 * A timed charge on a lobbed entity: FuseSystem counts `ticks` down and detonates the entity where
 * it lies — a radial Combat.explode from its Position, then removal. Flat scalars only, so a charge
 * in flight rides a save / map transfer like any other component.
 * @typedef {Object} Fuse
 * @property {number} ticks        sim ticks until detonation, counted from the throw
 * @property {number} radius       blast radius (world px)
 * @property {number} damage       damage at the blast centre; halves toward the edge (Combat.explode)
 * @property {number} owner        entity id whose faction the blast spares (the thrower)
 * @property {number} [penetration] armor penetration at each hit (Combat.mitigate). Default 0.
 */
globalThis.Fuse = "Fuse";
