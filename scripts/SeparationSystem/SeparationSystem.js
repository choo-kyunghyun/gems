/**
 * Equal-mass MTV push-apart for unit crowding, over the mirrors (PuppetSystem). Pure resolution,
 * run after SolidSystem.update in the SAME tick: the bodies come from the level's Colliders
 * (that update's collider walk, so no second walk here), and each solid body asks the runtime
 * once — `instance_place_list` over `Puppet` at its own mask — for what it overlaps, sums half
 * of every overlap's shallower axis against each other BODY (a Solid hit is the solid pass's,
 * skipped), then — every push summed before any body moves, so a pair reads one overlap from
 * both sides — moves that far through `move_and_collide` against `Solid`, so a push never lands
 * a body inside a wall. Each side pushes itself, so a pair separates by its whole overlap; a
 * solid-off body wears the empty mask, so it neither lists nor is pushed. Position is read back
 * off the instance (the components stay the truth — PuppetSystem).
 */
globalThis.SeparationSystem = {
  iterations: 1, // raise for dense clusters; each pass re-asks the runtime
  _list: -1, // the runtime's hit list, made on first use and kept for the run
  // Scratch reused every tick: the summed push per body index (docs/ARCHITECTURE.md → Hot-path idioms).
  _px: [],
  _py: [],

  update(level) {
    const entities = level.entities;
    const c = SolidSystem.colliders(level);
    const ids = c.bodyIds;
    const cols = c.bodyCols;
    const poss = c.bodyPos;
    const n = c.bodyCount;
    const held = entities.column(Instance);
    const mask = Handle.INDEX_MASK;
    if (SeparationSystem._list === -1) SeparationSystem._list = ds_list_create();
    const list = SeparationSystem._list;

    const pxs = SeparationSystem._px;
    const pys = SeparationSystem._py;
    for (let it = 0; it < SeparationSystem.iterations; it++) {
      // the pushes, off this pass's positions
      for (let i = 0; i < n; i++) {
        pxs[i] = 0;
        pys[i] = 0;
        if (!cols[i].solid) continue;
        const h = held[ids[i] & mask];
        if (h === undefined) continue; // no mirror yet — PuppetSystem's next update mints it
        if (!h.shaped) continue;
        const inst = h.inst;
        ds_list_clear(list);
        const found = inst.instance_place_list(inst.x, inst.y, Puppet, list, false);
        if (found === 0) continue;
        const ax1 = inst.bbox_left;
        const ay1 = inst.bbox_top;
        const ax2 = inst.bbox_right;
        const ay2 = inst.bbox_bottom;
        let px = 0;
        let py = 0;
        for (let k = 0; k < found; k++) {
          const o = ds_list_find_value(list, k);
          const oid = o.eid;
          if (oid === undefined) continue; // a Puppet that mirrors no entity
          const oh = held[oid & mask];
          if (oh === undefined) continue;
          if (oh.still) continue; // a Solid: the solid pass keeps bodies out of those
          const bx1 = o.bbox_left;
          const by1 = o.bbox_top;
          const bx2 = o.bbox_right;
          const by2 = o.bbox_bottom;
          const ox = Math.min(ax2, bx2) - Math.max(ax1, bx1);
          const oy = Math.min(ay2, by2) - Math.max(ay1, by1);
          if (ox < oy) px += (ax1 + ax2 < bx1 + bx2 ? -1 : 1) * ox * 0.5; // by centre
          else py += (ay1 + ay2 < by1 + by2 ? -1 : 1) * oy * 0.5;
        }
        pxs[i] = px;
        pys[i] = py;
      }
      // the moves
      for (let i = 0; i < n; i++) {
        const px = pxs[i];
        const py = pys[i];
        if (px === 0 && py === 0) continue;
        const h = held[ids[i] & mask];
        const inst = h.inst;
        // one axis at a time with the other capped, as SolidSystem moves (no perpendicular creep)
        if (px !== 0) inst.move_and_collide(px, 0, Solid, 1, 0, 0, -1, 0);
        if (py !== 0) inst.move_and_collide(0, py, Solid, 1, 0, 0, 0, -1);
        const pos = poss[i];
        pos.x = inst.x - h.ox;
        pos.y = inst.y - h.oy;
      }
    }
  },
};
