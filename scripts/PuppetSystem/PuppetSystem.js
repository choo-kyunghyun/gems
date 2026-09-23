/**
 * The puppet as the entity's mirror: every collider owns one instance (`Puppets`), and this
 * ticker keeps it a live copy of the components at the sim head — the mask off `BBox`
 * (`pixMaskUnit` under `image_xscale`/`image_yscale` = box / MASK, the runtime having no
 * shaped mask at runtime — docs/GMRT.md), the instance's x/y at the box's centre off
 * `Position` every tick for a mover and once for a kinematic (a kinematic never moves —
 * `Colliders`' static-is-static premise), `Collision.solid` as the mask (`pixMaskNone` while
 * off, so a corpse or an open door answers no query yet still draws), and `eid`, the entity
 * behind the instance a query reads back. The components stay the truth: nothing reads a
 * position off the instance, and a writer of Position calls nothing — the next update sees it.
 *
 * The walk is THE collider walk of a tick: it also lists the kinematic carriers for the level's
 * Colliders (`colliders` — its derived entry, seeded on the first read), whose fingerprint
 * re-bakes the statics NavGrid stamps when the set moved. So the bake is as of this tick's
 * update; a reader ahead of it (a map's first tick) gets a walk of its own.
 *
 * A rigged collider's box is centred (every preset's is), so its mask centre IS its feet and
 * `draw_self` at the instance's x/y lands the doll where `RenderBillboard` expects it; the
 * draw scale rides that pass's world matrix since `image_xscale` is the mask's. A rig without a
 * collider (minted by SkeletonSystem) follows its Position at scale 1.
 *
 * The built-ins are room-global, so a parked level's mirrors leave every query through `park`
 * (deactivated, still held) and come back through `thaw` — which activates EVERY instance, the
 * per-instance activate being inert (docs/GMRT.md), so the caller parks the other pooled levels
 * again after it (ColonyTravel.resume); a puppet released while parked is destroyed there too
 * (Puppets.reap).
 */
globalThis.PuppetSystem = {
  KEY: "colliders", // its derived token on the level's own entity — the Colliders
  MASK: 32, // the unit mask sprite's side (px)

  /** The level's Colliders, baked: a level this system has not walked yet takes a walk here. */
  colliders(level) {
    const c = level.entities.derive(level.self, PuppetSystem.KEY, PuppetSystem._seed);
    if (c.ids === null) c.walk(level.entities);
    return c;
  },

  _seed() {
    return new Colliders();
  },

  update(level) {
    const entities = level.entities;
    const held = entities.column(Instance); // hoisted: one index read per collider, not a get
    const mask = Handle.INDEX_MASK;
    const c = entities.derive(level.self, PuppetSystem.KEY, PuppetSystem._seed);
    const walkIds = c.walkIds;
    const walkSolids = c.walkSolids;
    let w = 0;
    entities.forEach([Collision, Position, BBox], (id, col, pos, box) => {
      let h = held[id & mask];
      if (h === undefined) h = Puppets.attach(entities, id);
      if (!h.shaped) PuppetSystem._shape(h, id, col, pos, box);
      const inst = h.inst;
      if (col.solid !== h.solid) {
        h.solid = col.solid;
        inst.mask_index = col.solid ? pixMaskUnit : pixMaskNone;
      }
      if (h.still) {
        walkIds[w] = id;
        walkSolids[w] = col.solid;
        w++;
        return;
      }
      inst.x = pos.x + h.ox;
      inst.y = pos.y + h.oy;
    });
    walkIds.length = w;
    walkSolids.length = w;
    c.refresh(entities);
    // a rig with no collider draws at its feet
    entities.forEach([Skeleton, Instance, Position], (id, sk, h, pos) => {
      if (h.shaped) return;
      h.inst.x = pos.x;
      h.inst.y = pos.y;
    });
  },

  /** Size, anchor and place the mask once — a BBox is fixed for the entity's life. */
  _shape(h, id, col, pos, box) {
    const inst = h.inst;
    const k = PuppetSystem.MASK;
    h.sx = box.width / k;
    h.sy = box.height / k;
    h.ox = box.x + box.width * 0.5;
    h.oy = box.y + box.height * 0.5;
    h.still = col.kinematic === true;
    h.solid = col.solid;
    h.shaped = true;
    inst.image_xscale = h.sx;
    inst.image_yscale = h.sy;
    inst.mask_index = col.solid ? pixMaskUnit : pixMaskNone;
    inst.eid = id;
    inst.x = pos.x + h.ox;
    inst.y = pos.y + h.oy;
  },

  /** Take a level's mirrors out of every query — a parked map (ColonyTravel.suspend). */
  park(level) {
    level.entities.forEach([Instance], (id, h) => {
      instance_deactivate_object(h.inst);
    });
  },

  /** Bring a parked level's mirrors back — and every other parked level's with them (above). */
  thaw(level) {
    instance_activate_all();
    Puppets.reap();
  },
};
