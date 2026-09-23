/**
 * Equal-mass MTV push-apart for unit crowding, over the mirrors (PuppetSystem). Pure resolution,
 * run after SolidSystem.update in the SAME tick: each solid body asks the runtime once —
 * `instance_place_list` over `Puppet` at its own mask — for what it overlaps, sums half of every
 * overlap's shallower axis against each other BODY (a Solid hit is the solid pass's, skipped),
 * then — every push summed before any body moves, so a pair reads one overlap from both sides —
 * moves that far through the runtime against the Solids (PuppetSystem.move), so a push never
 * lands a body inside a wall. Each side pushes itself, so a pair separates by its whole overlap;
 * a solid-off body wears the empty mask, so it neither lists nor is pushed.
 */
globalThis.SeparationSystem = {
  iterations: 1, // raise for dense clusters; each pass re-asks the runtime
  // Scratch reused every tick: the pushed bodies of a pass — the mirror, the Position and the
  // summed push per body (docs/ARCHITECTURE.md → Hot-path idioms).
  _held: [],
  _pos: [],
  _px: [],
  _py: [],

  update(level) {
    const entities = level.entities;
    const held = entities.column(Instance);
    const mask = Handle.INDEX_MASK;

    const hs = SeparationSystem._held;
    const ps = SeparationSystem._pos;
    const pxs = SeparationSystem._px;
    const pys = SeparationSystem._py;
    for (let it = 0; it < SeparationSystem.iterations; it++) {
      // the pushes, off this pass's positions
      let n = 0;
      entities.forEach([Collision, Instance, Position], (id, col, h, pos) => {
        if (h.still) return; // a kinematic: the solid pass keeps bodies out of those
        if (!col.solid) return;
        if (!h.shaped) return; // no mirror yet — PuppetSystem's next update shapes it
        const inst = h.inst;
        const list = PuppetSystem.list();
        const found = inst.instance_place_list(inst.x, inst.y, Puppet, list, false);
        if (found === 0) return;
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
          if (oh.still) continue; // a Solid
          const bx1 = o.bbox_left;
          const by1 = o.bbox_top;
          const bx2 = o.bbox_right;
          const by2 = o.bbox_bottom;
          const ox = Math.min(ax2, bx2) - Math.max(ax1, bx1);
          const oy = Math.min(ay2, by2) - Math.max(ay1, by1);
          if (ox < oy) px += (ax1 + ax2 < bx1 + bx2 ? -1 : 1) * ox * 0.5; // by centre
          else py += (ay1 + ay2 < by1 + by2 ? -1 : 1) * oy * 0.5;
        }
        if (px === 0 && py === 0) return;
        hs[n] = h;
        ps[n] = pos;
        pxs[n] = px;
        pys[n] = py;
        n++;
      });
      // the moves
      for (let i = 0; i < n; i++) PuppetSystem.move(hs[i], ps[i], pxs[i], pys[i], 1);
    }
  },
};
