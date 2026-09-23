/**
 * The puppet as the entity's mirror. Owner of every Puppet's lifetime — the ONLY caller of
 * instance_create/instance_destroy, which is what lets two features share one instance per
 * entity instead of each minting its own: `attach` mints the entity's Instance as a TRANSIENT
 * component with a release hook (Table.mint), so the puppet goes when the component does — a
 * detach, the entity's removal at flush, a whole-entity transfer, a level's teardown — and
 * nothing holds an id across frames to reap it. The object is the query filter: a kinematic
 * collider is a `Solid`, `Puppet`'s child, so `Puppet` names every mirror and `Solid` the
 * statics alone.
 *
 * The ticker keeps each collider's instance a live copy of the components at the sim head —
 * the mask off `BBox` (`pixMaskUnit` under `image_xscale`/`image_yscale` = box / MASK, the
 * runtime having no shaped mask at runtime — docs/GMRT.md), the instance's x/y at the box's
 * centre off `Position` every tick for a mover and once for a kinematic (a kinematic never
 * moves — `Colliders`' static-is-static premise), `Collision.solid` as the mask (`pixMaskNone`
 * while off, so a corpse or an open door answers no query yet still draws), and `eid`, the
 * entity behind the instance a query reads back. The components stay the truth: nothing reads
 * a position off the instance, and a writer of Position calls nothing — the next update sees it.
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
 * again after it (ColonyTravel.resume); a puppet released while parked waits on the doomed list
 * for that thaw, the one point that can destroy it (`reap`).
 *
 * What a query or a move over the mirrors shares lives here too: `list`, the one runtime hit
 * list every `*_list` built-in fills and its caller drains before anything else can ask, and
 * `move`, the one way a body displaces — one axis at a time through `move_and_collide` against
 * `Solid` with the other axis's move capped to 0, so the runtime's perpendicular try never creeps
 * a body along a face it is pressed into, and Position read back off the instance.
 */
globalThis.PuppetSystem = {
  KEY: "colliders", // its derived token on the level's own entity — the Colliders
  MASK: 32, // the unit mask sprite's side (px)
  _probe: null,
  _doomed: [],
  _list: -1, // the runtime's hit list, made on first use and kept for the run

  /**
   * The entity's puppet, minted on first call. Returns the Instance component data so a caller
   * that just attached reads `inst` without a second `get`; the mirror fields (Instance) start
   * unshaped, for `update` to fill.
   */
  attach(entities, id) {
    const held = entities.get(id, Instance);
    if (held !== undefined) return held;
    const col = entities.get(id, Collision);
    const obj = col !== undefined && col.kinematic === true ? Solid : Puppet;
    const data = {
      inst: instance_create_depth(0, 0, 0, obj),
      rigged: false,
      shaped: false,
      still: false,
      solid: false,
      sx: 1,
      sy: 1,
      ox: 0,
      oy: 0,
    };
    entities.mint(id, Instance, data, PuppetSystem._release);
    return data;
  },

  /**
   * The parked instance a query runs in — a collision built-in needs an instance self — off
   * every level with the empty mask, made on first use and kept for the run.
   */
  probe() {
    if (PuppetSystem._probe === null) {
      const p = instance_create_depth(-4096, -4096, 0, Puppet);
      p.mask_index = pixMaskNone;
      PuppetSystem._probe = p;
    }
    return PuppetSystem._probe;
  },

  /**
   * The release hook: the component left its slot, so the puppet goes with it. A parked
   * level's puppet is deactivated, which `instance_destroy` silently skips and no per-instance
   * activate can undo (docs/GMRT.md), so it waits on the doomed list for the next `reap`.
   */
  _release(data) {
    if (instance_exists(data.inst)) instance_destroy(data.inst);
    else PuppetSystem._doomed.push(data.inst);
  },

  /** Destroy the released puppets a park kept alive — right after an `instance_activate_all`. */
  reap() {
    const doomed = PuppetSystem._doomed;
    for (let i = 0; i < doomed.length; i++) instance_destroy(doomed[i]);
    doomed.length = 0;
  },

  /** The runtime's hit list, cleared — drained by its caller before the next ask. */
  list() {
    if (PuppetSystem._list === -1) PuppetSystem._list = ds_list_create();
    ds_list_clear(PuppetSystem._list);
    return PuppetSystem._list;
  },

  /**
   * Displace a shaped mirror by (dx, dy) in `iters` sub-steps against the Solids and read the
   * Position back. The return of `move_and_collide` is a GML array: read through array_length
   * or not at all (docs/GMRT.md).
   */
  move(h, pos, dx, dy, iters) {
    const inst = h.inst;
    if (dx !== 0) inst.move_and_collide(dx, 0, Solid, iters, 0, 0, -1, 0);
    if (dy !== 0) inst.move_and_collide(0, dy, Solid, iters, 0, 0, 0, -1);
    pos.x = inst.x - h.ox;
    pos.y = inst.y - h.oy;
  },

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
      if (h === undefined) h = PuppetSystem.attach(entities, id);
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
    PuppetSystem.reap();
  },
};
