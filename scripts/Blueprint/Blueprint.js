// Blueprint — a serializable SET OF BUILDS (tiles + built entities) captured from a region, and
// the stamp that re-lays it elsewhere. The Build Mode feature (copy a base layout and paste it)
// and save-game build-state restore are the SAME operation over the same data, so both go through
// here — capture once, stamp anywhere.
//
// A plan is plain, Json-safe data:
//   { w, h, tiles: [{ dx, dy, item }], ents: [{ dx, dy, item, snapshot? }] }
// `item` is a BuildMode CATALOG id (string); dx/dy are cell offsets from the plan origin. An ent's
// optional `snapshot` is an EntitySnapshot record — WITH it, stamp restores the exact entity
// (a chest keeps its contents, a turret its damage); WITHOUT it, stamp builds a fresh instance
// (the right default when duplicating a layout as a template). All placement runs through
// BuildMode.applyItem, so a stamped build is identical to a hand-placed one (colliders, _built /
// _builtEnts tracking, render dirty).
globalThis.Blueprint = {
  /**
   * Capture the builds inside a cell rect into a plan (offsets relative to x1,y1).
   * @param {Object} scene @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
   * @param {{ withState?: boolean }} [opts] withState → include each entity's exact snapshot
   * @returns {Object} the plan
   */
  capture(scene, x1, y1, x2, y2, opts = {}) {
    const tiles = [];
    const ents = [];
    const bk = Object.keys(scene._built);
    for (let i = 0; i < bk.length; i++) {
      const c = bk[i].split(",");
      const gx = Number(c[0]);
      const gy = Number(c[1]);
      if (gx < x1 || gx > x2 || gy < y1 || gy > y2) continue;
      tiles.push({ dx: gx - x1, dy: gy - y1, item: scene._built[bk[i]] });
    }
    const ek = Object.keys(scene._builtEnts);
    for (let i = 0; i < ek.length; i++) {
      const c = ek[i].split(",");
      const gx = Number(c[0]);
      const gy = Number(c[1]);
      if (gx < x1 || gx > x2 || gy < y1 || gy > y2) continue;
      const e = scene._builtEnts[ek[i]];
      const ent = { dx: gx - x1, dy: gy - y1, item: e.itemId };
      if (opts.withState === true && scene.entities.isValid(e.ent))
        ent.snapshot = EntitySnapshot.capture(scene.entities, e.ent);
      ents.push(ent);
    }
    return { w: x2 - x1 + 1, h: y2 - y1 + 1, tiles, ents };
  },

  /**
   * Stamp a plan with its origin at cell (ox, oy). Tiles go down first (so a door reads its
   * finished neighboring walls), then entities; the single solid (wall) layer is remeshed once at
   * the end rather than per tile. Ungated — the caller decides validity/cost.
   * @param {Object} scene @param {number} ox @param {number} oy @param {Object} plan
   * @returns {number} pieces placed
   */
  stamp(scene, ox, oy, plan) {
    if (plan === null || plan === undefined) return 0;
    let n = 0;
    let remeshWall = false;
    const tiles = plan.tiles !== undefined ? plan.tiles : [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const item = BuildMode.item(t.item);
      if (item === undefined) continue; // stale/removed catalog id
      const solid = BuildMode.applyItem(scene, ox + t.dx, oy + t.dy, item, {
        deferRemesh: true,
      });
      if (solid === true) remeshWall = true;
      n++;
    }
    const ents = plan.ents !== undefined ? plan.ents : [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      const item = BuildMode.item(e.item);
      if (item === undefined) continue;
      BuildMode.applyItem(scene, ox + e.dx, oy + e.dy, item, {
        snapshot: e.snapshot,
      });
      n++;
    }
    // one remesh for the whole batch (the wall layer is the only solid one)
    if (remeshWall)
      TileEdit.remesh(
        scene.entities,
        scene.grid,
        scene.wallLayer,
        scene.colliders,
      );
    return n;
  },
};
