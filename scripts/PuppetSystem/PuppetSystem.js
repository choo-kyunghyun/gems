/**
 * The puppet as the entity's mirror, and the sole owner of every puppet's lifetime — the only
 * caller of instance_create/instance_destroy, so features share one instance per entity. `attach`
 * mints the Instance as a transient component with a release hook, so the puppet goes whenever
 * the component does and nothing holds an id across frames. A kinematic collider is a `Solid`,
 * `Puppet`'s child, so `Puppet` queries every mirror and `Solid` the statics alone.
 *
 * `update` keeps each collider's instance a copy of its components: the mask scaled off `BBox`
 * (no shaped mask at runtime — docs/GMRT.md), x/y at the box centre every tick for a mover and
 * once for a kinematic, the empty mask while `Collision.solid` is off, and `eid` for a query to
 * read back. The components stay the truth: nothing reads a position off the instance, and a
 * writer of Position calls nothing.
 *
 * The walk also counts changes to the kinematic set into `gen` on the level's `colliders` record,
 * so a mirror of the statics polls it by number. It assumes a kinematic solid never moves or
 * resizes in place — every change replaces entities — so a solid given a Velocity leaves `gen`
 * stale.
 *
 * A collider's box is centred, so its mask centre is its feet and a rig draws at the instance's
 * x/y; a rig without a collider follows its Position at scale 1.
 *
 * The built-ins are room-global, so a parked level's mirrors leave every query through `park`
 * and return through `thaw`, which activates every instance (docs/GMRT.md) — the caller re-parks
 * the other pooled levels. A puppet released while parked waits for that thaw to be destroyed.
 *
 * `list` is the one runtime hit list, drained by its caller before the next ask; `move` is the
 * one way a body displaces — one axis at a time, the other capped to 0 so the runtime's
 * perpendicular try never creeps a body along a face it is pressed into.
 */
globalThis.PuppetSystem = {
  KEY: "colliders", // derived, on the level's own entity
  MASK: 32, // the unit mask sprite's side (px)
  _probe: null,
  _doomed: [],
  _list: -1, // made on first use, kept for the run

  /** Idempotent; returns the Instance data, unshaped until the next `update`. */
  attach(entities, id) {
    const held = entities.get(id, Instance);
    if (held !== undefined) return held;
    const col = entities.get(id, Collision);
    const obj = col !== undefined && col.kinematic === true ? Solid : Puppet;
    const data = { inst: instance_create_depth(0, 0, 0, obj) };
    entities.add(id, Instance, data, { mint: true, destroy: PuppetSystem._release });
    return data;
  },

  /** An off-map instance with the empty mask, as the self a collision built-in needs. */
  probe() {
    if (PuppetSystem._probe === null) {
      const p = instance_create_depth(-4096, -4096, 0, Puppet);
      p.mask_index = pixMaskNone;
      PuppetSystem._probe = p;
    }
    return PuppetSystem._probe;
  },

  /** A deactivated puppet cannot be destroyed (docs/GMRT.md), so it waits for `reap`. */
  _release(data) {
    if (instance_exists(data.inst)) instance_destroy(data.inst);
    else PuppetSystem._doomed.push(data.inst);
  },

  /** Precondition: every instance was just activated. */
  reap() {
    const doomed = PuppetSystem._doomed;
    for (let i = 0; i < doomed.length; i++) instance_destroy(doomed[i]);
    doomed.length = 0;
  },

  /** Cleared; the caller drains it before the next ask. */
  list() {
    if (PuppetSystem._list === -1) PuppetSystem._list = ds_list_create();
    ds_list_clear(PuppetSystem._list);
    return PuppetSystem._list;
  },

  /**
   * Displace a shaped mirror against `against` — `Solid`, or an array of it and tile maps — and
   * write the result to `pos`. The return of `move_and_collide` is a GML array (docs/GMRT.md).
   */
  move(h, pos, dx, dy, iters, against) {
    const inst = h.inst;
    if (dx !== 0) inst.move_and_collide(dx, 0, against, iters, 0, 0, -1, 0);
    if (dy !== 0) inst.move_and_collide(0, dy, against, iters, 0, 0, 0, -1);
    pos.x = inst.x - h.ox;
    pos.y = inst.y - h.oy;
  },

  /** `gen` counts kinematic-set changes as of the last walk; `count` is the kinematics it saw. */
  colliders(level) {
    return level.entities.derive(level.self, PuppetSystem.KEY, PuppetSystem._seed);
  },

  _seed() {
    return { gen: 0, count: 0 };
  },

  update(level) {
    const entities = level.entities;
    const held = entities.column(Instance); // one index read per collider, not a get
    const mask = Handle.INDEX_MASK;
    const c = PuppetSystem.colliders(level);
    let still = 0;
    let moved = false;
    entities.forEach([Collision, Position, BBox], (id, col, pos, box) => {
      let h = held[id & mask];
      if (h === undefined) h = PuppetSystem.attach(entities, id);
      if (!h.shaped) {
        PuppetSystem._shape(h, id, col, pos, box);
        if (h.still) moved = true;
      }
      const inst = h.inst;
      if (col.solid !== h.solid) {
        h.solid = col.solid;
        inst.mask_index = col.solid ? pixMaskUnit : pixMaskNone;
        if (h.still) moved = true;
      }
      if (h.still) {
        still++;
        return;
      }
      inst.x = pos.x + h.ox;
      inst.y = pos.y + h.oy;
    });
    if (still !== c.count) moved = true;
    c.count = still;
    if (moved) c.gen++;
    entities.forEach([Instance, Position], (id, h, pos) => {
      if (h.shaped) return;
      if (!h.rigged) return;
      h.inst.x = pos.x;
      h.inst.y = pos.y;
    });
  },

  /** Once per entity: a BBox is fixed for the entity's life. */
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

  /** Take a level's mirrors out of every query. */
  park(level) {
    level.entities.forEach([Instance], (id, h) => {
      instance_deactivate_object(h.inst);
    });
  },

  /** Also reactivates every other parked level's mirrors. */
  thaw(level) {
    instance_activate_all();
    PuppetSystem.reap();
  },
};
